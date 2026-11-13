FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
ARG GOPROXY=https://goproxy.cn,direct
RUN GOPROXY="$GOPROXY" go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/quartz-server ./cmd/quartz-server && \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/quartz-admin ./cmd/quartz-admin && \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/quartz-observer ./cmd/quartz-observer
FROM alpine:3.23
ARG APK_MIRROR=https://mirrors.aliyun.com/alpine
RUN sed -i "s|https://dl-cdn.alpinelinux.org/alpine|${APK_MIRROR}|g" /etc/apk/repositories && \
    apk add --no-cache ca-certificates tzdata git imagemagick imagemagick-webp imagemagick-heic ffmpeg && addgroup -g 1000 quartz && adduser -D -u 1000 -G quartz quartz
COPY --from=build /out/ /usr/local/bin/
COPY internal/emoji/UNICODE_LICENSE.txt /usr/share/licenses/quartz-server/UNICODE_LICENSE.txt
USER quartz
EXPOSE 8080
ENTRYPOINT ["quartz-server"]
