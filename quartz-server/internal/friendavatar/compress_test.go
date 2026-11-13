package friendavatar

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/png"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func requireCompressor(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("magick"); err != nil {
		t.Skip("native avatar tests require ImageMagick with WebP support")
	}
}
func TestCompressStaticAndRetainSmallOriginal(t *testing.T) {
	var small bytes.Buffer
	png.Encode(&small, image.NewRGBA(image.Rect(0, 0, 8, 8)))
	data, mime, ext, err := Compress(context.Background(), small.Bytes(), DefaultTargetKiB)
	if err != nil || mime != "image/png" || ext != "png" || !bytes.Equal(data, small.Bytes()) {
		t.Fatal("small original changed", err)
	}
	requireCompressor(t)
	img := image.NewNRGBA(image.Rect(0, 0, 800, 600))
	random := rand.New(rand.NewSource(819))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i] = byte(random.Intn(256))
		img.Pix[i+1] = byte(random.Intn(256))
		img.Pix[i+2] = byte(random.Intn(256))
		img.Pix[i+3] = byte(random.Intn(256))
	}
	var original bytes.Buffer
	png.Encode(&original, img)
	data, mime, ext, err = Compress(context.Background(), original.Bytes(), 32)
	if err != nil || mime != "image/webp" || ext != "webp" || len(data) > 32*1024 {
		t.Fatal("static compression", len(data), mime, err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "output.webp")
	os.WriteFile(path, data, 0600)
	info, err := exec.Command("magick", "identify", "-format", "%w %h %[channels]", path).Output()
	fields := strings.Fields(string(info))
	width, height := 0, 0
	if len(fields) >= 2 {
		width, _ = strconv.Atoi(fields[0])
		height, _ = strconv.Atoi(fields[1])
	}
	if err != nil || width < 1 || width > 256 || height < 1 || height > 256 || !strings.Contains(string(info), "a") {
		t.Fatal("dimensions/transparency", string(info), err)
	}
	again, _, _, err := Compress(context.Background(), original.Bytes(), 32)
	if err != nil || !bytes.Equal(data, again) {
		t.Fatal("compression must be deterministic for content-addressed storage", err)
	}
}
func TestCompressRetainsAnimatedGIFAndAPNG(t *testing.T) {
	requireCompressor(t)
	palette := color.Palette{color.Transparent, color.RGBA{255, 40, 20, 255}, color.RGBA{20, 60, 255, 255}}
	first := image.NewPaletted(image.Rect(0, 0, 384, 384), palette)
	second := image.NewPaletted(first.Rect, palette)
	for i := range first.Pix {
		first.Pix[i] = 1
		second.Pix[i] = 2
	}
	var original bytes.Buffer
	gif.EncodeAll(&original, &gif.GIF{Image: []*image.Paletted{first, second}, Delay: []int{20, 40}, Disposal: []byte{gif.DisposalBackground, gif.DisposalBackground}, LoopCount: 0})
	gifData := append([]byte{}, original.Bytes()...)
	apngData := animatedPNG(t, first, second)
	dir := t.TempDir()
	gifPath := filepath.Join(dir, "source.gif")
	webpPath := filepath.Join(dir, "source.webp")
	os.WriteFile(gifPath, gifData, 0600)
	if raw, err := exec.Command("magick", gifPath, "-coalesce", webpPath).CombinedOutput(); err != nil {
		t.Fatal("WebP fixture", string(raw), err)
	}
	webpData, err := os.ReadFile(webpPath)
	if err != nil {
		t.Fatal(err)
	}
	for name, input := range map[string][]byte{"gif": gifData, "apng": apngData, "webp": webpData} {
		t.Run(name, func(t *testing.T) {
			data, mime, ext, err := Compress(context.Background(), input, 64)
			if err != nil || mime != "image/webp" || ext != "webp" || webpFrames(data) != 2 || len(data) > 64*1024 {
				t.Fatal("animation was lost", mime, len(data), webpFrames(data), err)
			}
			path := filepath.Join(t.TempDir(), "animation.webp")
			os.WriteFile(path, data, 0600)
			raw, err := exec.Command("magick", "identify", "-format", "%T ", path).Output()
			if err != nil || strings.TrimSpace(string(raw)) != "20 40" {
				t.Fatal("frame timing changed", string(raw), err)
			}
		})
	}
}
func animatedPNG(t *testing.T, frames ...image.Image) []byte {
	t.Helper()
	var out bytes.Buffer
	out.WriteString("\x89PNG\r\n\x1a\n")
	chunk := func(kind string, data []byte) {
		binary.Write(&out, binary.BigEndian, uint32(len(data)))
		out.WriteString(kind)
		out.Write(data)
		crc := crc32.NewIEEE()
		crc.Write([]byte(kind))
		crc.Write(data)
		binary.Write(&out, binary.BigEndian, crc.Sum32())
	}
	seq := uint32(0)
	for i, frame := range frames {
		var raw bytes.Buffer
		rgba := image.NewNRGBA(frame.Bounds())
		draw.Draw(rgba, rgba.Bounds(), frame, frame.Bounds().Min, draw.Src)
		png.Encode(&raw, rgba)
		var idat []byte
		for p := 8; p+12 <= raw.Len(); {
			data := raw.Bytes()
			n := int(binary.BigEndian.Uint32(data[p : p+4]))
			kind := string(data[p+4 : p+8])
			if kind == "IHDR" && i == 0 {
				chunk(kind, data[p+8:p+8+n])
				control := make([]byte, 8)
				binary.BigEndian.PutUint32(control, uint32(len(frames)))
				chunk("acTL", control)
			}
			if kind == "IDAT" {
				idat = append(idat, data[p+8:p+8+n]...)
			}
			p += n + 12
		}
		control := make([]byte, 26)
		binary.BigEndian.PutUint32(control, seq)
		seq++
		binary.BigEndian.PutUint32(control[4:], uint32(frame.Bounds().Dx()))
		binary.BigEndian.PutUint32(control[8:], uint32(frame.Bounds().Dy()))
		binary.BigEndian.PutUint16(control[20:], uint16(20+i*20))
		binary.BigEndian.PutUint16(control[22:], 100)
		chunk("fcTL", control)
		if i == 0 {
			chunk("IDAT", idat)
		} else {
			payload := make([]byte, 4)
			binary.BigEndian.PutUint32(payload, seq)
			seq++
			chunk("fdAT", append(payload, idat...))
		}
	}
	chunk("IEND", nil)
	return out.Bytes()
}

func TestCompressJPEGAndAVIF(t *testing.T) {
	requireCompressor(t)
	for _, ext := range []string{"jpg", "avif"} {
		t.Run(ext, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "input."+ext)
			if raw, err := exec.Command("magick", "-size", "384x320", "gradient:#9ab4d8-#68507f", path).CombinedOutput(); err != nil {
				t.Fatal("fixture encode", string(raw), err)
			}
			input, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			output, mime, format, err := Compress(context.Background(), input, 64)
			if err != nil || mime != "image/webp" || format != "webp" || len(output) > 64*1024 {
				t.Fatal("compression", mime, format, len(output), err)
			}
		})
	}
}

func TestCompressReferenceImage(t *testing.T) {
	source := os.Getenv("AVATAR_TEST_SOURCE")
	if source == "" {
		t.Skip("set AVATAR_TEST_SOURCE for a real-image regression check")
	}
	requireCompressor(t)
	input, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	result, mime, _, err := Compress(context.Background(), input, DefaultTargetKiB)
	if err != nil || len(result) > DefaultTargetKiB*1024 {
		t.Fatal("reference compression", len(result), err)
	}
	if frames := apngFrames(input); frames > 1 && webpFrames(result) != frames {
		t.Fatal("reference animation lost", frames, webpFrames(result))
	}
	t.Logf("source=%d bytes, stored=%d bytes, format=%s, frames=%d", len(input), len(result), mime, webpFrames(result))
}
