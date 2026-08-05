import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RecordsPage from './RecordsPage'
import { BillingOrderStatus, CreditPointBusinessType } from './types'
import { TENANT_ID_STORAGE_KEY } from './ui'

function mdApiResponse(data: unknown) {
  return new Response(JSON.stringify({ state: 1, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fillCommonQuery(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Authorization'), 'md_pss_id session-token')
  await user.type(screen.getByLabelText('Tenant ID'), 'tenant-1')
}

describe('billing records demo', () => {
  it('prefills and updates the shared Tenant ID', async () => {
    sessionStorage.setItem(TENANT_ID_STORAGE_KEY, 'tenant-shared')
    const user = userEvent.setup()
    render(<RecordsPage />)

    const tenantInput = screen.getByLabelText('Tenant ID')
    expect(tenantInput).toHaveValue('tenant-shared')

    await user.clear(tenantInput)
    await user.type(tenantInput, 'tenant-next')

    expect(sessionStorage.getItem(TENANT_ID_STORAGE_KEY)).toBe('tenant-next')
  })

  it('queries orders and renders enum labels with original account ids', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(mdApiResponse({
      items: [{
        orderId: 'order-1',
        orderNo: 'B001',
        productSource: 1,
        tenantId: 'tenant-1',
        item: { productCode: 10101, productName: 'HAP用户扩展包', quantity: 1, unitPrice: 128 },
        totalAmount: 128,
        orderStatus: BillingOrderStatus.Expired,
        paymentMethod: 3,
        creatorAccountId: 'creator-id',
        payerAccountId: 'payer-id',
        createdAt: 1_753_142_400_000,
        paidAt: 1_753_142_500_000,
        completedAt: 0,
      }],
      page: { totalCount: 1, pageIndex: 1, pageSize: 20 },
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<RecordsPage />)
    await fillCommonQuery(user)

    await user.click(screen.getByRole('button', { name: '查询记录' }))

    expect(await screen.findByText('HAP用户扩展包')).toBeInTheDocument()
    expect(screen.getByText('creator-id')).toBeInTheDocument()
    expect(screen.getByText('payer-id')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('已过期')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('信用点')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '已过期' })).toHaveValue('4')
    const request = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(request).toEqual(expect.objectContaining({
      projectId: 'tenant-1',
      orderStatuses: [],
      pageIndex: 1,
      pageSize: 20,
    }))
    expect(fetchMock.mock.calls[0][0]).toBe('/mdapi/Billing/ListOrders')
  })

  it('shows the current balance with credit entries', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mdApiResponse({
        productSource: 1,
        tenantId: 'tenant-1',
        balance: 197.157,
        createTime: '2025-07-22 07:59:00',
        updateTime: '2025-07-22 08:00:00',
      }))
      .mockResolvedValueOnce(mdApiResponse({
        items: [{
          id: 'entry-1',
          transactionType: 2,
          amount: -12.5,
          balanceBefore: 209.657,
          balanceAfter: 197.157,
          quantity: 1,
          businessType: CreditPointBusinessType.Aigc,
          operatorAccountId: 'operator-id',
          remark: 'AI 调用',
          createTime: '2025-07-22 08:00:00',
        }],
        page: { totalCount: 1, pageIndex: 1, pageSize: 20 },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<RecordsPage />)
    await user.click(screen.getByRole('button', { name: '信用点明细' }))
    await fillCommonQuery(user)
    await user.click(screen.getByRole('button', { name: /选择业务类型/ }))
    await user.click(screen.getByRole('checkbox', { name: 'AIGC' }))
    await user.click(screen.getByRole('checkbox', { name: '邮件' }))

    await user.click(screen.getByRole('button', { name: '查询记录' }))

    expect(await screen.findAllByText('197.157')).toHaveLength(2)
    expect(screen.getByText('2025-07-22 08:00:00 更新')).toBeInTheDocument()
    expect(screen.getByText('operator-id')).toBeInTheDocument()
    expect(screen.getByText('AI 调用')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('支出')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('AIGC')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('-12.5')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('2025-07-22 08:00:00')).toBeInTheDocument()
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/mdapi/Billing/GetCreditPointBalance',
      '/mdapi/Billing/GetListCreditPoints',
    ])
    const request = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(request.businessTypes).toEqual([
      CreditPointBusinessType.Aigc,
      CreditPointBusinessType.Email,
    ])
    expect(request).not.toHaveProperty('businessType')
  })

  it('shows credit entries and hides the balance when the balance request fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        state: 0,
        exception: 'Unauthorized',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(mdApiResponse({
        items: [{
          id: 'entry-1',
          transactionType: 2,
          amount: -12.5,
          balanceBefore: 20,
          balanceAfter: 7.5,
          quantity: 1,
          businessType: CreditPointBusinessType.Aigc,
          operatorAccountId: 'operator-id',
          remark: 'AI 调用',
          createdAt: 1_753_142_400_000,
        }],
        page: { totalCount: 1, pageIndex: 1, pageSize: 20 },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<RecordsPage />)
    await user.click(screen.getByRole('button', { name: '信用点明细' }))
    await fillCommonQuery(user)

    await user.click(screen.getByRole('button', { name: '查询记录' }))

    expect(await screen.findByText('operator-id')).toBeInTheDocument()
    expect(screen.queryByLabelText('当前信用点余额')).not.toBeInTheDocument()
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument()
  })

  it('forces refund transaction type and displays optional original entry and operator ids', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mdApiResponse({
        productSource: 2,
        tenantId: 'tenant-1',
        balance: 80,
        createTime: '2025-07-22 07:59:00',
        updateTime: '2025-07-22 08:00:00',
      }))
      .mockResolvedValueOnce(mdApiResponse({
        items: [{
          id: 'refund-entry-id',
          transactionType: 3,
          amount: 20,
          balanceBefore: 60,
          balanceAfter: 80,
          quantity: 1,
          businessType: CreditPointBusinessType.Aigc,
          operatorAccountId: 'refund-operator-id',
          remark: '测试退款',
          createdAt: 1_753_142_400_000,
        }],
        page: { totalCount: 1, pageIndex: 1, pageSize: 20 },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<RecordsPage />)
    await user.click(screen.getByRole('button', { name: '信用点退款' }))
    await fillCommonQuery(user)

    await user.click(screen.getByRole('button', { name: '查询记录' }))

    expect(await within(screen.getByRole('table')).findByText('—')).toBeInTheDocument()
    expect(screen.getByText('refund-operator-id')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('退款')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('AIGC')).toBeInTheDocument()
    const request = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(request.transactionType).toBe(3)
    expect(request).not.toHaveProperty('refundOnly')
  })
})
