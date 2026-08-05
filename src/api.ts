import type {
  ApiResult,
  BillingOrder,
  CreateOrderRequest,
  CreatePaymentRequest,
  CreatePaymentResponse,
  CreditPointBalance,
  CreditPointOverview,
  CreditPointStatisticsSummary,
  GetCreditPointOverviewRequest,
  GetCreditPointStatisticsData,
  GetCreditPointStatisticsRequest,
  GetCreditPointStatisticsSummaryRequest,
  GetCreditPointBalanceRequest,
  GetListCreditPointsData,
  GetListCreditPointsRequest,
  GetPaymentOrderResponse,
  ListOrdersData,
  ListOrdersRequest,
  PaymentQuery,
} from './types'
import {
  CreditPointBusinessType,
  CreditPointStatisticGranularity,
  CreditPointTransactionType,
  ProductSource,
  type CreditPointBusinessType as CreditPointBusinessTypeValue,
  type CreditPointStatisticGranularity as CreditPointStatisticGranularityValue,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code?: number
  constructor(message: string, status: number, code?: number) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code
  }
}

function validateAuthorization(authorization: string) {
  const normalized = authorization.trim()
  if (!/^md_pss_id\s+\S+$/.test(normalized)) throw new ApiError('Authorization 格式应为 md_pss_id {sessionId}。', 0)
  return normalized
}

function toUtc8DateTimestamp(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00.000+08:00`)
  if (!Number.isFinite(timestamp)) throw new ApiError('统计日期格式应为 yyyy-MM-dd。', 0)
  return timestamp
}

function toUtc8TimeTimestamp(value: string) {
  if (!value) return 0
  const dateTime = value.includes('T') ? value : `${value}T00:00:00`
  const timestamp = Date.parse(`${dateTime}+08:00`)
  if (!Number.isFinite(timestamp)) throw new ApiError('时间格式无效。', 0)
  return timestamp
}

async function request<T>(path: string, authorization: string, init: RequestInit): Promise<T> {
  const { response, payload } = await send<ApiResult<T>>(path, authorization, init)
  if (!response.ok || payload.code !== 1 || payload.data === undefined) {
    const fallback = response.status === 401 ? 'Authorization 无效或已过期。' : 'Billing API 请求失败。'
    throw new ApiError(payload.message?.trim() || fallback, response.status, payload.code)
  }
  return payload.data
}

interface MdApiResult<T> {
  state: number
  exception?: string
  data?: T
}

async function requestMdApi<T>(path: string, authorization: string, init: RequestInit): Promise<T> {
  const { response, payload } = await send<MdApiResult<T>>(path, authorization, init)
  if (!response.ok || payload.state !== 1 || payload.data === undefined) {
    const fallback = response.status === 401 ? 'Authorization 无效或已过期。' : 'MDAPI 请求失败。'
    throw new ApiError(payload.exception?.trim() || fallback, response.status, payload.state)
  }
  return payload.data
}

async function send<T>(path: string, authorization: string, init: RequestInit) {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', validateAuthorization(authorization))
  if (init.body) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(path, { ...init, headers, credentials: 'omit' }) }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('无法连接后端接口，请检查代理地址和服务状态。', 0)
  }
  let payload: T
  try { payload = await response.json() as T }
  catch { throw new ApiError(`后端接口返回了无法解析的响应（HTTP ${response.status}）。`, response.status) }
  return { response, payload }
}

export function getOrder(query: PaymentQuery, authorization: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ tenantId: query.tenantId, orderId: query.orderId })
  return request<GetPaymentOrderResponse>(`/api/Payment/GetOrder?${params}`, authorization, { method: 'GET', signal })
}

export function createPayment(payload: CreatePaymentRequest, authorization: string, signal?: AbortSignal) {
  return request<CreatePaymentResponse>('/api/Payment/CreatePayment', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function listOrders(payload: ListOrdersRequest, authorization: string, signal?: AbortSignal) {
  if (payload.productSource === ProductSource.Hap) {
    return requestMdApi<ListOrdersData>('/mdapi/Billing/ListOrders', authorization, {
      method: 'POST',
      body: JSON.stringify({
        projectId: payload.tenantId,
        orderStatuses: payload.orderStatuses,
        productCode: payload.productCode,
        orderNo: payload.orderNo,
        creatorAccountId: payload.creatorAccountId,
        createdFrom: payload.createdFrom,
        createdTo: payload.createdTo,
        pageIndex: payload.page.pageIndex,
        pageSize: payload.page.pageSize,
      }),
      signal,
    })
  }
  return request<ListOrdersData>('/api/BillingTest/ListOrders', authorization, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      createdFrom: toUtc8TimeTimestamp(payload.createdFrom),
      createdTo: toUtc8TimeTimestamp(payload.createdTo),
    }),
    signal,
  })
}

export function createOrder(payload: CreateOrderRequest, authorization: string, signal?: AbortSignal) {
  return request<BillingOrder>('/api/BillingTest/CreateOrder', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function getCreditPointBalance(
  payload: GetCreditPointBalanceRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  if (payload.productSource === ProductSource.Hap) {
    return requestMdApi<CreditPointBalance>('/mdapi/Billing/GetCreditPointBalance', authorization, {
      method: 'POST', body: JSON.stringify({ projectId: payload.tenantId }), signal,
    })
  }
  return request<CreditPointBalance>('/api/Payment/GetCreditPointBalance', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function listCreditPoints(
  payload: GetListCreditPointsRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  if (payload.productSource === ProductSource.Hap) {
    return requestMdApi<GetListCreditPointsData>('/mdapi/Billing/GetListCreditPoints', authorization, {
      method: 'POST',
      body: JSON.stringify({
        projectId: payload.tenantId,
        transactionType: payload.transactionType,
        businessTypes: payload.businessTypes,
        operatorAccountId: payload.operatorAccountId,
        createdFrom: payload.createdFrom,
        createdTo: payload.createdTo,
        extensionFilters: payload.extensionFilters,
        pageIndex: payload.page.pageIndex,
        pageSize: payload.page.pageSize,
      }),
      signal,
    })
  }
  return request<GetListCreditPointsData>('/api/BillingTest/GetListCreditPoints', authorization, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      createdFrom: toUtc8TimeTimestamp(payload.createdFrom),
      createdTo: toUtc8TimeTimestamp(payload.createdTo),
    }),
    signal,
  })
}

export function getCreditPointOverview(
  payload: GetCreditPointOverviewRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  if (payload.productSource === ProductSource.Hap) {
    return requestMdApi<CreditPointOverview>('/mdapi/Billing/GetCreditPointOverview', authorization, {
      method: 'POST',
      body: JSON.stringify({
        projectId: payload.tenantId,
        createdFrom: payload.createdFrom,
        createdTo: payload.createdTo,
      }),
      signal,
    })
  }
  return request<CreditPointOverview>('/api/BillingTest/GetCreditPointOverview', authorization, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      createdFrom: toUtc8DateTimestamp(payload.createdFrom),
      createdTo: toUtc8DateTimestamp(payload.createdTo),
    }),
    signal,
  })
}

export function getCreditPointStatistics(
  payload: GetCreditPointStatisticsRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  if (payload.productSource === ProductSource.Hap) {
    return requestMdApi<GetCreditPointStatisticsData>(
      '/mdapi/Billing/GetCreditPointStatistics',
      authorization,
      {
        method: 'POST',
        body: JSON.stringify({
          projectId: payload.tenantId,
          transactionType: payload.transactionType,
          businessTypes: payload.businessTypes,
          createdFrom: payload.createdFrom,
          createdTo: payload.createdTo,
          extensionFilters: payload.extensionFilters,
          groupByBusinessType: payload.groupByBusinessType,
          groupByExtensionField: payload.groupByExtensionField,
          granularity: payload.granularity,
          pageIndex: payload.page.pageIndex,
          pageSize: payload.page.pageSize,
        }),
        signal,
      },
    )
  }
  return request<GetCreditPointStatisticsData>(
    '/api/BillingTest/GetCreditPointStatistics',
    authorization,
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        createdFrom: toUtc8DateTimestamp(payload.createdFrom),
        createdTo: toUtc8DateTimestamp(payload.createdTo),
      }),
      signal,
    },
  )
}

export async function getCreditPointStatisticsSummary(
  payload: GetCreditPointStatisticsSummaryRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  if (payload.productSource === ProductSource.Hap) {
    return requestMdApi<CreditPointStatisticsSummary>(
      '/mdapi/Billing/GetCreditPointStatisticsSummary',
      authorization,
      {
        method: 'POST',
        body: JSON.stringify({
          projectId: payload.tenantId,
          createdFrom: payload.createdFrom,
          createdTo: payload.createdTo,
        }),
        signal,
      },
    )
  }

  const common = {
    ...payload,
    transactionType: CreditPointTransactionType.Expense,
    businessTypes: [] as CreditPointBusinessTypeValue[],
    extensionFilters: {},
    page: { pageIndex: 1, pageSize: 200 },
  }
  const aggregate = (
    groupByBusinessType: boolean,
    groupByExtensionField: string,
    granularity: CreditPointStatisticGranularityValue,
    businessTypes: CreditPointBusinessTypeValue[] = [],
  ) => getCreditPointStatistics({
    ...common,
    businessTypes,
    groupByBusinessType,
    groupByExtensionField,
    granularity,
  }, authorization, signal)

  const [distribution, scenes, trend, models, applications] = await Promise.all([
    aggregate(true, '', CreditPointStatisticGranularity.None),
    aggregate(false, 'resourceType', CreditPointStatisticGranularity.None),
    aggregate(true, '', CreditPointStatisticGranularity.Day),
    aggregate(false, 'modelName', CreditPointStatisticGranularity.Day,
      [CreditPointBusinessType.Aigc]),
    aggregate(true, 'workspaceId', CreditPointStatisticGranularity.None),
  ])
  return { distribution, scenes, trend, models, applications }
}

export function getSafeRedirectUrl(value?: string) {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null }
  catch { return null }
}
