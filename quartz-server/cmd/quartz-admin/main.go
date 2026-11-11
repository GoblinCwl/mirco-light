package main

import (
	"context"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/config"
	"goblincwl/quartz-server/internal/database"
	"goblincwl/quartz-server/internal/visitors"
	"golang.org/x/term"
	"os"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	if !(len(os.Args) == 2 && (os.Args[1] == "set-password" || os.Args[1] == "reset-totp")) && !(len(os.Args) == 3 && os.Args[1] == "import-geoip") {
		return errors.New("用法：quartz-admin set-password | reset-totp | import-geoip <目录>")
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	db, err := database.Open(ctx, cfg.DatabaseDSN)
	if err != nil {
		return err
	}
	defer db.Close()
	if os.Args[1] == "import-geoip" {
		operation, cancel := context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
		if err = visitors.ImportGeo(operation, db, os.Args[2]); err != nil {
			return err
		}
		fmt.Println("IPv4/IPv6 数据集已校验并存入 MySQL，重启 server 后载入新版本。")
		return nil
	}
	service, err := auth.New(db, cfg.AuthDir)
	if err != nil {
		return err
	}
	if os.Args[1] == "reset-totp" {
		operation, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err = service.ResetTOTP(operation); err != nil {
			return err
		}
		fmt.Println("TOTP 已重置，旧会话及绑定请求已失效。请用现有密码重新绑定验证器。")
		return nil
	}
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return errors.New("请在交互式终端执行，密码不会回显")
	}
	fmt.Print("设置管理员密码（至少 12 个字符，不回显）：")
	password, err := term.ReadPassword(fd)
	fmt.Println()
	if err != nil {
		return err
	}
	fmt.Print("再次输入密码：")
	confirmation, err := term.ReadPassword(fd)
	fmt.Println()
	if err != nil {
		return err
	}
	if string(password) != string(confirmation) {
		return errors.New("两次输入的密码不一致")
	}
	operation, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err = service.SetPassword(operation, string(password)); err != nil {
		return err
	}
	fmt.Println("管理员密码已保存，原有会话已注销。")
	return nil
}
