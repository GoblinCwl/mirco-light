package secretbox

import (
	"bytes"
	"testing"
)

func TestDomainSeparation(t *testing.T) {
	key := bytes.Repeat([]byte{1}, 32)
	value, err := Seal("test", key, []byte("github"))
	if err != nil {
		t.Fatal(err)
	}
	if plain, err := Open(value, key, []byte("github")); err != nil || plain != "test" {
		t.Fatal("cannot open envelope")
	}
	if _, err = Open(value, key, []byte("bilibili")); err == nil {
		t.Fatal("swapped credential domains accepted")
	}
}
