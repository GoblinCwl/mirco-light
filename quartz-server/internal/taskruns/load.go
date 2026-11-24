package taskruns

import (
	"time"

	"goblincwl/quartz-server/internal/taskconfig"
)

type loadAmount struct {
	Starts        int   `json:"starts"`
	EstimatedMS   int64 `json:"estimatedMs"`
	UnknownStarts int   `json:"unknownStarts"`
}

type loadTask struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Samples int    `json:"samples"`
	loadAmount
}

type loadProjection struct {
	Days  []string          `json:"days"`
	Hours [7][24]loadAmount `json:"hours"`
	Tasks []loadTask        `json:"tasks"`
}

func projectLoad(now time.Time, instances []Instance) loadProjection {
	local := now.In(taskconfig.Beijing)
	midnight := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, taskconfig.Beijing)
	var out loadProjection
	for day := range out.Hours {
		out.Days = append(out.Days, midnight.AddDate(0, 0, day).Format("2006-01-02"))
	}
	for _, instance := range instances {
		if instance.Kind != "periodic" {
			continue
		}
		task := loadTask{Key: instance.Key, Name: instance.Name, Samples: instance.samples}
		for day := range out.Hours {
			for hour := range out.Hours[day] {
				count := instance.plan.HourCount(midnight.Add(time.Duration(day*24+hour) * time.Hour))
				cell := &out.Hours[day][hour]
				cost := int64(instance.averageMS*float64(count) + 0.5)
				cell.Starts += count
				cell.EstimatedMS += cost
				task.Starts += count
				task.EstimatedMS += cost
				if task.Samples == 0 {
					cell.UnknownStarts += count
					task.UnknownStarts += count
				}
			}
		}
		out.Tasks = append(out.Tasks, task)
	}
	return out
}
