# MD Billing Payment Web

独立的 React 账务联调工具，用于查询已有 Billing 订单、测试支付宝、微信 Native 和信用点支付，并查看订单、信用点及退款流水。项目不会引用 `MDBillingService` 源码。

## 启动

1. 复制 `.env.example` 为 `.env.local`，将 `PAYMENT_API_TARGET` 改为实际 Billing HTTP API 地址。
2. 安装依赖并启动：

```powershell
pnpm install
pnpm dev
```

浏览器访问终端输出的本地地址。Vite 会把 `/api/*` 代理到 Billing API，因此后端不需要开启 CORS。

## 使用

- Authorization 填写完整值：`md_pss_id {sessionId}`。
- 填写 Tenant ID 和已有 Billing Order ID 后查询，产品来源由订单自动确定。
- 页面只会显示订单策略允许的支付方式。
- Authorization 仅保存在当前标签页的 `sessionStorage`，不会进入 URL 或 `localStorage`。
- 可通过 `/?tenantId=...&orderId=...` 预填订单定位参数。
- 访问 `/records` 或从支付测试页点击“查看账务记录”，可以按 gRPC 同款参数查询订单和信用点明细；退款页固定使用交易类型 `3` 查询，不依赖原支出流水 ID。
- 记录页只展示接口返回的原始状态值与账户 ID，不联查用户资料。

## 验证

```powershell
pnpm lint
pnpm test
pnpm build
```
