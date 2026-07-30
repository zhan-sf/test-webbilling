import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOrder,
  createPayment,
  getCreditPointBalance,
  getCreditPointOverview,
  getCreditPointStatistics,
  getOrder,
  getSafeRedirectUrl,
  listCreditPoints,
  listOrders,
} from './api'
import {
  BillingPaymentMethod,
  CreditPointBusinessType,
  CreditPointTransactionType,
  ProductSource,
} from './types'

const authorization = 'md_pss_id session-token'

afterEach(() => vi.unstubAllGlobals())

describe('Billing API client', () => {
  it('queries an order with encoded parameters and Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 1,
      data: { orderId: 'order/1', availablePaymentMethods: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await getOrder({
      tenantId: 'tenant A',
      orderId: 'order/1',
    }, authorization)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/Payment/GetOrder?tenantId=tenant+A&orderId=order%2F1')
    expect(new Headers(init.headers).get('Authorization')).toBe(authorization)
    expect(init.method).toBe('GET')
  })

  it('creates a payment with the expected JSON contract and Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 1,
      data: { orderId: 'order-1', actionType: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await createPayment({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      paymentMethod: BillingPaymentMethod.WechatPay,
      returnUrl: 'http://localhost:5173/?orderId=order-1',
    }, authorization)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/Payment/CreatePayment')
    expect(new Headers(init.headers).get('Authorization')).toBe(authorization)
    expect(JSON.parse(String(init.body))).toEqual({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      paymentMethod: 2,
      returnUrl: 'http://localhost:5173/?orderId=order-1',
    })
  })

  it('uses the test query endpoints and preserves grpc-shaped request bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      code: 1,
      data: { items: [], page: { totalCount: 0, pageIndex: 1, pageSize: 20 } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    const common = {
      requestId: 'MDBillingPaymentWeb',
      productSource: ProductSource.Hap,
      tenantId: 'tenant-1',
    }

    await listOrders({
      ...common,
      orderStatuses: [2],
      productCode: 10101,
      orderNo: '',
      creatorAccountId: '',
      createdFrom: 0,
      createdTo: 0,
      page: { pageIndex: 1, pageSize: 20 },
    }, authorization)
    await getCreditPointBalance({
      productSource: common.productSource,
      tenantId: common.tenantId,
    }, authorization)
    await listCreditPoints({
      ...common,
      transactionType: CreditPointTransactionType.Refund,
      businessType: CreditPointBusinessType.Unspecified,
      operatorAccountId: '',
      createdFrom: 0,
      createdTo: 0,
      extensionFilters: {},
      page: { pageIndex: 1, pageSize: 20 },
    }, authorization)
    await getCreditPointOverview({
      ...common,
      createdFrom: 1_700_000_000_000,
      createdTo: 1_700_100_000_000,
    }, authorization)
    await getCreditPointStatistics({
      ...common,
      transactionType: 2,
      businessTypes: [CreditPointBusinessType.Aigc],
      createdFrom: 1_700_000_000_000,
      createdTo: 1_700_100_000_000,
      extensionFilters: {},
      groupByBusinessType: true,
      groupByExtensionField: 'modelName',
      granularity: 2,
      refundFilter: 1,
      page: { pageIndex: 1, pageSize: 200 },
    }, authorization)

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/BillingTest/ListOrders',
      '/api/Payment/GetCreditPointBalance',
      '/api/BillingTest/GetListCreditPoints',
      '/api/BillingTest/GetCreditPointOverview',
      '/api/BillingTest/GetCreditPointStatistics',
    ])
    const balanceBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(balanceBody).toEqual({ productSource: ProductSource.Hap, tenantId: 'tenant-1' })
    const refundBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))
    expect(refundBody.transactionType).toBe(CreditPointTransactionType.Refund)
    expect(refundBody.page).toEqual({ pageIndex: 1, pageSize: 20 })
    const statisticsBody = JSON.parse(String((fetchMock.mock.calls[4][1] as RequestInit).body))
    expect(statisticsBody.groupByExtensionField).toBe('modelName')
    expect(statisticsBody.page).toEqual({ pageIndex: 1, pageSize: 200 })
  })

  it('creates a test order with the grpc-shaped body and Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 1,
      data: { orderId: 'order-1', tenantId: 'tenant-1' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await createOrder({
      requestId: 'MDBillingPaymentWeb',
      productSource: ProductSource.Hap,
      tenantId: 'tenant-1',
      productCode: 10101,
      quantity: 1,
      totalAmount: 88.66,
      businessContext: {},
    }, authorization)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/BillingTest/CreateOrder')
    expect(new Headers(init.headers).get('Authorization')).toBe(authorization)
    expect(JSON.parse(String(init.body))).toEqual({
      requestId: 'MDBillingPaymentWeb',
      productSource: 1,
      tenantId: 'tenant-1',
      productCode: 10101,
      quantity: 1,
      totalAmount: 88.66,
      businessContext: {},
    })
  })

  it('surfaces HTTP and ApiResult failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 10005,
      message: '账号未登录',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })))

    await expect(getOrder({
      tenantId: 'tenant-1',
      orderId: 'order-1',
    }, authorization)).rejects.toEqual(expect.objectContaining({
      status: 401,
      code: 10005,
      message: '账号未登录',
    }))
  })

  it('rejects missing session values and unsafe redirects', async () => {
    await expect(getOrder({
      tenantId: 'tenant-1',
      orderId: 'order-1',
    }, 'token-only')).rejects.toThrow('Authorization 格式')
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBeNull()
    expect(getSafeRedirectUrl('https://pay.example.com/start')).toBe('https://pay.example.com/start')
  })
})
