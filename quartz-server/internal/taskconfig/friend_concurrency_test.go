package taskconfig
import "testing"
func TestFriendConcurrencyConfiguration(t *testing.T){
 for _,tc:=range []struct{value float64;want int}{{0,1},{1,1},{4,4},{8,8},{9,1},{1.5,1}}{
 c:=New(map[string]any{"tasks.friendConcurrency":tc.value});if got:=c.FriendConcurrency();got!=tc.want{t.Fatal(tc,got)}
 }
 c:=New(nil);ctx:=With(t.Context(),c);ch,stop:=Watch(ctx,"tasks.friendConcurrency");defer stop();c.Reload(map[string]any{"tasks.friendConcurrency":float64(3)})
 select{case <-ch:default:t.Fatal("configuration change did not wake workers")}
 if c.FriendConcurrency()!=3{t.Fatal("not applied")}
}
