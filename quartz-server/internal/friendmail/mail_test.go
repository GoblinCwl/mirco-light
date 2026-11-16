package friendmail

import (
	"strings"
	"testing"
)

func TestReviewTemplateEscapesContent(t *testing.T) {
	for _, accepted := range []bool{true, false} {
		subject, body, err := Render(Message{Name: "<script>alert(1)</script>", Reason: "<img src=x onerror=alert(1)>", Accepted: accepted}, "https://goblincwl.site")
		expected := "未予收录"
		if accepted {
			expected = "已通过"
		}
		if err != nil || !strings.Contains(subject, expected) || strings.Contains(body, "<script>") || strings.Contains(body, "<img src=x") || !strings.Contains(body, "prefers-color-scheme: dark") {
			t.Fatal(subject, err)
		}
		if accepted && !strings.Contains(body, "https://goblincwl.site/friends/") {
			t.Fatal("missing action")
		}
	}
}

func TestFeedbackTemplate(t *testing.T) {
	subject, body, err := Render(Message{Kind: "feedback", Reason: "原始反馈<script>unsafe</script>"}, "https://goblincwl.site")
	if err != nil || !strings.Contains(subject, "反馈已处理") || strings.Contains(body, "友链") || strings.Contains(body, "<script>") || !strings.Contains(body, "反馈内容") || !strings.Contains(body, "prefers-color-scheme: dark") {
		t.Fatal(subject, err)
	}
}

func TestInspectionRemovalTemplate(t *testing.T) {
	subject, body, err := Render(Message{Kind: "friends-removed", Name: "旧友链", Reason: "巡检累计失败 7 次"}, "https://goblincwl.site")
	if err != nil || !strings.Contains(subject, "友链巡检") || !strings.Contains(body, "友链已移除") || !strings.Contains(body, "巡检累计失败 7 次") {
		t.Fatal(subject, err)
	}
}
