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

  it('routes HAP queries through MDAPI and maps request bodies', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify({
      ...(path.startsWith('/mdapi/') ? { state: 1 } : { code: 1 }),
      data: path.endsWith('/GetCreditPointBalance')
        ? {
            productSource: ProductSource.Hap,
            tenantId: 'tenant-1',
            balance: 10,
            createTime: '2025-07-22 07:59:00',
            updateTime: '2025-07-22 08:00:00',
          }
        : { items: [], page: { totalCount: 0, pageIndex: 1, pageSize: 20 } },
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
    const balance = await getCreditPointBalance({
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
      '/mdapi/Billing/ListOrders',
      '/mdapi/Billing/GetCreditPointBalance',
      '/mdapi/Billing/GetListCreditPoints',
      '/mdapi/Billing/GetCreditPointOverview',
      '/mdapi/Billing/GetCreditPointStatistics',
    ])
    const orderBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(orderBody).toEqual({
      projectId: 'tenant-1',
      orderStatuses: [2],
      productCode: 10101,
      orderNo: '',
      creatorAccountId: '',
      createdFrom: 0,
      createdTo: 0,
      pageIndex: 1,
      pageSize: 20,
    })
    const balanceBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(balanceBody).toEqual({ projectId: 'tenant-1' })
    expect(balance.updateTime).toBe('2025-07-22 08:00:00')
    const refundBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))
    expect(refundBody.transactionType).toBe(CreditPointTransactionType.Refund)
    expect(refundBody).not.toHaveProperty('requestId')
    expect(refundBody).not.toHaveProperty('productSource')
    expect(refundBody).not.toHaveProperty('tenantId')
    expect(refundBody).not.toHaveProperty('page')
    expect(refundBody).toEqual(expect.objectContaining({
      projectId: 'tenant-1',
      pageIndex: 1,
      pageSize: 20,
    }))
    const statisticsBody = JSON.parse(String((fetchMock.mock.calls[4][1] as RequestInit).body))
    expect(statisticsBody.groupByExtensionField).toBe('modelName')
    expect(statisticsBody).toEqual(expect.objectContaining({
      projectId: 'tenant-1',
      pageIndex: 1,
      pageSize: 200,
    }))
  })

  it('keeps HDP queries on BillingTest with grpc-shaped bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 1,
      data: { items: [], page: { totalCount: 0, pageIndex: 1, pageSize: 20 } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      requestId: 'MDBillingPaymentWeb',
      productSource: ProductSource.Hdp,
      tenantId: 'tenant-1',
      orderStatuses: [],
      productCode: 0,
      orderNo: '',
      creatorAccountId: '',
      createdFrom: 0,
      createdTo: 0,
      page: { pageIndex: 2, pageSize: 20 },
    }

    await listOrders(payload, authorization)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/BillingTest/ListOrders')
    expect(JSON.parse(String(init.body))).toEqual(payload)
  })

  it('keeps the HDP balance query on the Billing API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 1,
      data: { productSource: ProductSource.Hdp, tenantId: 'tenant-1', balance: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { productSource: ProductSource.Hdp, tenantId: 'tenant-1' }

    await getCreditPointBalance(payload, authorization)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/Payment/GetCreditPointBalance')
    expect(JSON.parse(String(init.body))).toEqual(payload)
  })

  it('surfaces MDAPI envelope failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      state: 7,
      exception: '权限不足',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(getCreditPointOverview({
      requestId: 'MDBillingPaymentWeb',
      productSource: ProductSource.Hap,
      tenantId: 'tenant-1',
      createdFrom: 1,
      createdTo: 2,
    }, authorization)).rejects.toEqual(expect.objectContaining({
      status: 200,
      code: 7,
      message: '权限不足',
    }))
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
