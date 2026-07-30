import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CreateOrderPage from './CreateOrderPage'
import { TENANT_ID_STORAGE_KEY } from './ui'

describe('create order page', () => {
  it('selects a product and sends a fixed quantity order with Authorization', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 1,
      data: {
        orderId: 'order-1',
        orderNo: 'B001',
        productSource: 2,
        tenantId: 'tenant-1',
        item: { productCode: 20201, productName: 'HDP信用点充值', quantity: 1, unitPrice: 0.01 },
        totalAmount: 0.01,
        orderStatus: 1,
        paymentMethod: 0,
        createdAt: 1,
        paidAt: 0,
        completedAt: 0,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const navigate = vi.fn()
    render(<CreateOrderPage navigate={navigate} />)

    await user.type(screen.getByLabelText('Authorization'), 'md_pss_id session-token')
    await user.click(screen.getByText('HDP 信用点充值'))
    await user.type(screen.getByLabelText('Tenant ID'), 'tenant-1')
    await user.type(screen.getByLabelText('订单金额'), '0.01')
    await user.click(screen.getByRole('button', { name: '创建订单并去支付' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('Authorization')).toBe('md_pss_id session-token')
    expect(JSON.parse(String(init.body))).toEqual({
      requestId: 'MDBillingPaymentWeb',
      productSource: 2,
      tenantId: 'tenant-1',
      productCode: 20201,
      quantity: 1,
      totalAmount: 0.01,
      businessContext: {},
    })
    expect(navigate).toHaveBeenCalledWith(
      '/payment?tenantId=tenant-1&orderId=order-1&autoQuery=1',
    )
    expect(sessionStorage.getItem(TENANT_ID_STORAGE_KEY)).toBe('tenant-1')
    expect(localStorage.length).toBe(0)
  })

  it('prefills and updates the shared Tenant ID', async () => {
    sessionStorage.setItem(TENANT_ID_STORAGE_KEY, 'tenant-shared')
    const user = userEvent.setup()
    render(<CreateOrderPage />)

    const tenantInput = screen.getByLabelText('Tenant ID')
    expect(tenantInput).toHaveValue('tenant-shared')

    await user.clear(tenantInput)
    await user.type(tenantInput, 'tenant-next')

    expect(sessionStorage.getItem(TENANT_ID_STORAGE_KEY)).toBe('tenant-next')
  })

  it('validates required input before calling the API', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<CreateOrderPage />)

    await user.click(screen.getByRole('button', { name: '创建订单并去支付' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Authorization 格式')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
