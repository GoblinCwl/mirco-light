package monitoring

import (
	"math"
	"regexp"
)

func finite(v any) (float64, bool) {
	n, ok := v.(float64)
	return n, ok && !math.IsNaN(n) && !math.IsInf(n, 0)
}
func object(v any) map[string]any { m, _ := v.(map[string]any); return m }
func Stats(raw map[string]any) map[string]any {
	result := map[string]any{}
	for _, key := range []string{"cpu", "mp", "dp", "ns", "nr"} {
		if n, ok := finite(raw[key]); ok {
			result[key] = n
		}
	}
	for key, size := range map[string]int{"la": 3, "b": 2, "dio": 2} {
		if values, ok := raw[key].([]any); ok {
			if len(values) > size {
				values = values[:size]
			}
			out := make([]any, len(values))
			for i, v := range values {
				if n, ok := finite(v); ok {
					out[i] = n
				} else if key == "b" {
					out[i] = float64(0)
				}
			}
			result[key] = out
		}
	}
	if _, exists := raw["dio"]; !exists {
		if _, ok := finite(raw["dp"]); ok {
			result["dio"] = []any{float64(0), float64(0)}
		}
	}
	var gpu *float64
	devices := map[string]any{}
	maximum := func(key string, n float64) {
		if previous, ok := devices[key].(float64); !ok || n > previous {
			devices[key] = n
		}
	}
	for _, v := range object(raw["g"]) {
		device := object(v)
		if n, ok := finite(device["u"]); ok && (gpu == nil || n > *gpu) {
			v := n
			gpu = &v
		}
		if n, ok := finite(device["t"]); ok && n > -20 && n < 150 {
			maximum("gpu", n)
		}
	}
	if gpu != nil {
		result["gpu"] = *gpu
	}
	var temperatures, cpu []float64
	for name, value := range object(raw["t"]) {
		if n, ok := finite(value); ok {
			temperatures = append(temperatures, n)
			if temperatureGroups[0].pattern.MatchString(name) {
				cpu = append(cpu, n)
			}
			if n > -20 && n < 150 {
				for _, group := range temperatureGroups {
					if group.pattern.MatchString(name) {
						maximum(group.name, n)
					}
				}
			}
		}
	}
	if len(cpu) > 0 {
		temperatures = cpu
	}
	if len(temperatures) > 0 {
		max := temperatures[0]
		for _, n := range temperatures[1:] {
			if n > max {
				max = n
			}
		}
		result["temperature"] = max
	}
	if len(devices) > 0 {
		result["temperatures"] = devices
	}
	return result
}

var temperatureGroups = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"cpu", regexp.MustCompile(`(?i)cpu|k10temp|coretemp|tctl|package`)},
	{"gpu", regexp.MustCompile(`(?i)radeon|amdgpu|nvidia|gpu`)},
	{"ssd", regexp.MustCompile(`(?i)nvme`)},
	{"memory", regexp.MustCompile(`(?i)spd|dimm|dram`)},
	{"wifi", regexp.MustCompile(`(?i)iwlwifi|wireless|wifi`)},
	{"disk", regexp.MustCompile(`(?i)drivetemp|sata|hdd|ata_`)},
}
