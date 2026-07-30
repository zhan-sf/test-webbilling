import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BillingPaymentActionType, BillingPaymentMethod } from './types'
import {
  AUTHORIZATION_STORAGE_KEY,
  formatAmount,
  TENANT_ID_STORAGE_KEY,
} from './ui'

const order = {
  orderId: 'order-1',
  orderNo: 'B20260722001',
  productCode: 10101,
  productName: 'HAP用户扩展包',
  quantity: 1,
  amount: 128,
  orderStatus: 1,
  availablePaymentMethods: [
    BillingPaymentMethod.Alipay,
    BillingPaymentMethod.WechatPay,
    BillingPaymentMethod.CreditPoint,
  ],
  createdAt: 1_753_142_400_000,
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function queryOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Authorization'), 'md_pss_id session-token')
  await user.type(screen.getByLabelText('Tenant ID'), 'tenant-1')
  await user.type(screen.getByLabelText('Billing Order ID'), 'order-1')
  await user.click(screen.getByRole('button', { name: '查询订单' }))
  await screen.findByText('HAP用户扩展包')
}

describe('payment test page', () => {
  beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)))

  it('formats yuan amounts', () => {
    expect(formatAmount(128)).toContain('128.00')
  })

  it('links to order creation and billing records', () => {
    render(<App />)

    expect(screen.getByRole('link', { name: '创建订单' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '查看账务记录' })).toHaveAttribute('href', '/records')
  })

  it('stores Authorization in sessionStorage but never in URL or localStorage', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 1, data: order })))
    render(<App />)

    await queryOrder(user)

    expect(sessionStorage.getItem(AUTHORIZATION_STORAGE_KEY)).toBe('md_pss_id session-token')
    expect(sessionStorage.getItem(TENANT_ID_STORAGE_KEY)).toBe('tenant-1')
    expect(localStorage.length).toBe(0)
    expect(window.location.href).not.toContain('session-token')
    expect(window.location.search).toContain('tenantId=tenant-1')
    expect(window.location.search).toContain('orderId=order-1')
  })

  it('automatically queries an order created by the order page', async () => {
    sessionStorage.setItem(AUTHORIZATION_STORAGE_KEY, 'md_pss_id session-token')
    sessionStorage.setItem(TENANT_ID_STORAGE_KEY, 'tenant-1')
    window.history.replaceState(null, '', '/payment?tenantId=tenant-1&orderId=order-1&autoQuery=1')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 1, data: order }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('HAP用户扩展包')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0])
      .toBe('/api/Payment/GetOrder?tenantId=tenant-1&orderId=order-1')
  })

  it('prefills Tenant ID from the current tab when the URL does not provide it', () => {
    sessionStorage.setItem(TENANT_ID_STORAGE_KEY, 'tenant-shared')

    render(<App />)

    expect(screen.getByLabelText('Tenant ID')).toHaveValue('tenant-shared')
  })

  it('renders a WeChat QR action after creating payment', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: order }))
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: {
          orderId: 'order-1',
          orderStatus: 1,
          paymentId: 'payment-1',
          paymentStatus: 1,
          actionType: BillingPaymentActionType.QrCode,
          actionContent: 'weixin://wxpay/bizpayurl?pr=test',
          expiresAt: Date.now() + 300_000,
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await queryOrder(user)

    await user.click(screen.getByText('微信支付'))
    await user.click(screen.getByRole('button', { name: '创建支付' }))

    expect(await screen.findByRole('heading', { name: '请使用微信扫码' })).toBeInTheDocument()
    expect(screen.getByLabelText('微信支付二维码').querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新创建支付' })).toBeEnabled()
  })

  it('opens Alipay in a new tab and keeps the confirmation dialog on the current page', async () => {
    const user = userEvent.setup()
    const popup = {
      opener: window,
      location: { href: '' },
      close: vi.fn(),
    }
    const openMock = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: order }))
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: {
          orderId: 'order-1',
          orderStatus: 1,
          paymentId: 'payment-alipay',
          paymentStatus: 1,
          actionType: BillingPaymentActionType.RedirectUrl,
          actionContent: 'https://openapi.alipay.test/pay',
          expiresAt: Date.now() + 300_000,
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await queryOrder(user)

    await user.click(screen.getByText('支付宝'))
    await user.click(screen.getByRole('button', { name: '创建支付' }))

    expect(openMock).toHaveBeenCalledWith('', '_blank')
    expect(popup.opener).toBeNull()
    expect(popup.location.href).toBe('https://openapi.alipay.test/pay')
    expect(await screen.findByRole('heading', { name: '请在新页面完成支付' })).toBeInTheDocument()
    const createCall = fetchMock.mock.calls[1] as [string, RequestInit]
    const createBody = JSON.parse(String(createCall[1].body))
    expect(createBody.returnUrl).toContain('paymentReturn=alipay')
    expect(createBody.returnUrl).not.toContain('session-token')
  })

  it('shows a manual Alipay link when the browser blocks the new tab', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: order }))
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: {
          orderId: 'order-1',
          orderStatus: 1,
          paymentId: 'payment-alipay',
          paymentStatus: 1,
          actionType: BillingPaymentActionType.RedirectUrl,
          actionContent: 'https://openapi.alipay.test/pay',
          expiresAt: Date.now() + 300_000,
        },
      })))
    render(<App />)
    await queryOrder(user)

    await user.click(screen.getByText('支付宝'))
    await user.click(screen.getByRole('button', { name: '创建支付' }))

    expect(await screen.findByText('浏览器阻止了新标签页，请点击下方按钮打开支付宝支付页。'))
      .toBeInTheDocument()
    expect(screen.getByRole('link', { name: '重新打开支付页' }))
      .toHaveAttribute('href', 'https://openapi.alipay.test/pay')
  })

  it('queries the order once when the user says payment is complete', async () => {
    const user = userEvent.setup()
    const completedOrder = { ...order, orderStatus: 3, availablePaymentMethods: [] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: order }))
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: {
          orderId: 'order-1',
          orderStatus: 1,
          paymentId: 'payment-1',
          paymentStatus: 1,
          actionType: BillingPaymentActionType.QrCode,
          actionContent: 'weixin://wxpay/bizpayurl?pr=test',
          expiresAt: Date.now() + 300_000,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: completedOrder }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await queryOrder(user)

    await user.click(screen.getByText('微信支付'))
    await user.click(screen.getByRole('button', { name: '创建支付' }))
    await user.click(await screen.findByRole('button', { name: '我已完成支付，查询结果' }))

    expect(await screen.findByText('支付结果已同步：订单已完成。')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('allows replacing an existing payment for a pending order', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: { ...order, paymentId: 'old-payment' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: {
          orderId: 'order-1',
          orderStatus: 1,
          paymentId: 'new-payment',
          paymentStatus: 1,
          actionType: BillingPaymentActionType.QrCode,
          actionContent: 'weixin://wxpay/bizpayurl?pr=new',
          expiresAt: Date.now() + 300_000,
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await queryOrder(user)

    await user.click(screen.getByText('微信支付'))
    await user.click(screen.getByRole('button', { name: '创建支付' }))

    expect(await screen.findByRole('heading', { name: '请使用微信扫码' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clears a loaded order when its request context changes', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 1, data: order })))
    render(<App />)
    await queryOrder(user)

    await user.type(screen.getByLabelText('Billing Order ID'), '-changed')

    expect(screen.queryByText('HAP用户扩展包')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '先连接一笔账务订单' })).toBeInTheDocument()
  })

  it('confirms credit payment and refreshes the completed order', async () => {
    const user = userEvent.setup()
    const completedOrder = { ...order, orderStatus: 3, availablePaymentMethods: [] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: order }))
      .mockResolvedValueOnce(jsonResponse({
        code: 1,
        data: {
          orderId: 'order-1', orderStatus: 3, paymentStatus: 0,
          actionType: BillingPaymentActionType.None, expiresAt: 0,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 1, data: completedOrder }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await queryOrder(user)

    await user.click(screen.getByText('信用点'))
    await user.click(screen.getByRole('button', { name: '创建支付' }))

    await screen.findByText('信用点支付成功，订单已完成。')
    await waitFor(() => expect(screen.getAllByText('订单已完成')).toHaveLength(2))
    expect(window.confirm).toHaveBeenCalledOnce()
    const createCall = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(createCall[1].body)).paymentMethod).toBe(BillingPaymentMethod.CreditPoint)
  })

  it('shows the authentication failure returned by the API', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 10005,
      message: '账号未登录',
    }, 401)))
    render(<App />)

    await user.type(screen.getByLabelText('Authorization'), 'md_pss_id expired')
    await user.type(screen.getByLabelText('Tenant ID'), 'tenant-1')
    await user.type(screen.getByLabelText('Billing Order ID'), 'order-1')
    await user.click(screen.getByRole('button', { name: '查询订单' }))

    expect(await screen.findByText('Authorization 无效或已过期，请重新填写后查询。')).toBeInTheDocument()
  })
})
