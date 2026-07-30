# Design System

## Theme

在普通办公室光线下使用的明亮产品界面。纯白内容面配中性灰配置区，以蜂蜜琥珀色标识选择和主要动作。

## Color

- Background: `oklch(1 0 0)`
- Surface: `oklch(0.975 0 0)`
- Ink: `oklch(0.18 0.012 62)`
- Muted: `oklch(0.52 0.01 62)`
- Primary: `oklch(0.74 0.162 68.1)`
- Primary action: `oklch(0.61 0.16 63)` with white text
- Semantic success, warning, and danger colors are reserved for real state feedback.

## Typography

使用系统无衬线字体，正文固定为 `1rem`。数据与金额启用等宽数字；界面只使用 0.75、0.875、1、1.125、1.375 和 2.5rem 六级字号。

## Layout

桌面为 320–380px 配置栏加弹性支付工作区；900px 以下切换为单列。间距遵循 4、8、12、16、24、32、48px 标尺。

## Components

- 控件圆角 8px，内容分区圆角 12px。
- 支付方式使用带分隔线的单选行，不使用重复卡片。
- 主按钮使用深琥珀底与白字；次操作使用白底描边。
- 加载使用内容骨架；错误、成功、等待分别使用语义色背景。

## Motion

交互状态使用 180ms ease-out。加载骨架和连接状态提供轻量反馈，并在 `prefers-reduced-motion` 下停止持续动画。
