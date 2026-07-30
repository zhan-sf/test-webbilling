import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  getCreditPointBalance,
  listCreditPoints,
  listOrders,
} from './api'
import {
  ProductSource,
  CreditPointBusinessType,
  CreditPointTransactionType,
  type BillingOrder,
  type CreditPointBalance,
  type CreditPointEntry,
  type GetListCreditPointsData,
  type ListOrdersData,
} from './types'
import {
  creditPointBusinessTypeLabels,
  creditPointTransactionTypeLabels,
  getEnumLabel,
  orderStatusLabels,
  paymentMethodLabels,
  productSourceLabels,
} from './enumLabels'
import {
  AUTHORIZATION_STORAGE_KEY,
  saveTenantId,
  TENANT_ID_STORAGE_KEY,
} from './ui'
import './RecordsPage.css'

type RecordsTab = 'orders' | 'credits' | 'refunds'

const productCodes = [
  { value: 10001, source: ProductSource.Hap, label: '10001 · HAP 主版本授权' },
  { value: 10101, source: ProductSource.Hap, label: '10101 · HAP 用户扩展包' },
  { value: 10102, source: ProductSource.Hap, label: '10102 · HAP 应用扩展包' },
  { value: 10103, source: ProductSource.Hap, label: '10103 · HAP 工作流扩展包' },
  { value: 10201, source: ProductSource.Hap, label: '10201 · HAP 信用点充值' },
  { value: 20001, source: ProductSource.Hdp, label: '20001 · HDP 主版本授权' },
  { value: 20101, source: ProductSource.Hdp, label: '20101 · HDP 用户扩展包' },
  { value: 20201, source: ProductSource.Hdp, label: '20201 · HDP 信用点充值' },
]

const orderStatusOptions = [1, 2, 3]
const transactionTypeOptions = [
  CreditPointTransactionType.Income,
  CreditPointTransactionType.Expense,
  CreditPointTransactionType.Refund,
]
const businessTypeOptions = Object.values(CreditPointBusinessType)
  .filter((value) => value !== CreditPointBusinessType.Unspecified)

function toTimestamp(value: string) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatTime(timestamp: number) {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function formatValue(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(value)
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Authorization 无效或已过期，请重新填写后查询。'
  }
  if (error instanceof Error && error.name !== 'AbortError') return error.message
  return ''
}

function parseExtensionFilters(value: string) {
  if (!value.trim()) return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('扩展字段必须是 JSON 对象。')
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item)]))
}

function RecordsPage() {
  const [activeTab, setActiveTab] = useState<RecordsTab>('orders')
  const [authorization, setAuthorization] = useState(
    () => sessionStorage.getItem(AUTHORIZATION_STORAGE_KEY) ?? '',
  )
  const [showAuthorization, setShowAuthorization] = useState(false)
  const [requestId, setRequestId] = useState('MDBillingPaymentWeb')
  const [productSource, setProductSource] = useState<ProductSource>(ProductSource.Hap)
  const [tenantId, setTenantId] = useState(
    () => sessionStorage.getItem(TENANT_ID_STORAGE_KEY) ?? '',
  )
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [orderStatus, setOrderStatus] = useState(0)
  const [productCode, setProductCode] = useState(0)
  const [orderNo, setOrderNo] = useState('')
  const [creatorAccountId, setCreatorAccountId] = useState('')
  const [transactionType, setTransactionType] = useState<CreditPointTransactionType>(
    CreditPointTransactionType.Unspecified,
  )
  const [businessType, setBusinessType] = useState<CreditPointBusinessType>(
    CreditPointBusinessType.Unspecified,
  )
  const [operatorAccountId, setOperatorAccountId] = useState('')
  const [extensionFilters, setExtensionFilters] = useState('')
  const [orders, setOrders] = useState<ListOrdersData | null>(null)
  const [creditPoints, setCreditPoints] = useState<GetListCreditPointsData | null>(null)
  const [balance, setBalance] = useState<CreditPointBalance | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<BillingOrder | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CreditPointEntry | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasQueried, setHasQueried] = useState(false)
  const [error, setError] = useState('')
  const requestController = useRef<AbortController | null>(null)

  const authorizationIsValid = /^md_pss_id\s+\S+$/.test(authorization.trim())
  const visibleProductCodes = useMemo(
    () => productCodes.filter((item) => item.source === productSource),
    [productSource],
  )
  const currentData = activeTab === 'orders' ? orders : creditPoints
  const currentPage = currentData?.page
  const totalPages = currentPage
    ? Math.max(1, Math.ceil(currentPage.totalCount / currentPage.pageSize))
    : 1

  useEffect(() => () => requestController.current?.abort(), [])

  const clearResults = () => {
    setOrders(null)
    setCreditPoints(null)
    setBalance(null)
    setSelectedOrder(null)
    setSelectedEntry(null)
    setHasQueried(false)
    setError('')
  }

  const changeTab = (tab: RecordsTab) => {
    setActiveTab(tab)
    clearResults()
  }

  const loadRecords = async (pageIndex: number) => {
    if (!authorizationIsValid) {
      setError('Authorization 格式应为 md_pss_id {sessionId}。')
      return
    }
    if (!tenantId.trim()) {
      setError('请填写 Tenant ID。')
      return
    }

    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const normalizedAuthorization = authorization.trim()
    saveTenantId(tenantId)
    const common = {
      requestId: requestId.trim(),
      productSource,
      tenantId: tenantId.trim(),
    }
    sessionStorage.setItem(AUTHORIZATION_STORAGE_KEY, normalizedAuthorization)
    setIsLoading(true)
    setHasQueried(true)
    setError('')
    setSelectedOrder(null)
    setSelectedEntry(null)

    try {
      if (activeTab === 'orders') {
        const result = await listOrders({
          ...common,
          orderStatuses: orderStatus ? [orderStatus] : [],
          productCode,
          orderNo: orderNo.trim(),
          creatorAccountId: creatorAccountId.trim(),
          createdFrom: toTimestamp(createdFrom),
          createdTo: toTimestamp(createdTo),
          page: { pageIndex, pageSize },
        }, normalizedAuthorization, controller.signal)
        setOrders(result)
        setCreditPoints(null)
        setBalance(null)
      } else {
        const filters = parseExtensionFilters(extensionFilters)
        const [balanceResult, listResult] = await Promise.all([
          getCreditPointBalance({
            productSource: common.productSource,
            tenantId: common.tenantId,
          }, normalizedAuthorization, controller.signal),
          listCreditPoints({
            ...common,
            transactionType: activeTab === 'refunds'
              ? CreditPointTransactionType.Refund
              : transactionType,
            businessType,
            operatorAccountId: operatorAccountId.trim(),
            createdFrom: toTimestamp(createdFrom),
            createdTo: toTimestamp(createdTo),
            extensionFilters: filters,
            page: { pageIndex, pageSize },
          }, normalizedAuthorization, controller.signal),
        ])
        setCreditPoints(listResult)
        setBalance(balanceResult)
        setOrders(null)
      }
    } catch (requestError) {
      if (!(requestError instanceof Error && requestError.name === 'AbortError')) {
        setError(getErrorMessage(requestError))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void loadRecords(1)
  }

  const clearAuthorization = () => {
    sessionStorage.removeItem(AUTHORIZATION_STORAGE_KEY)
    setAuthorization('')
    clearResults()
  }

  return (
    <div className="records-shell">
      <header className="records-header">
        <div>
          <p className="records-eyebrow">MD Billing</p>
          <h1>账务记录测试台</h1>
        </div>
        <div className="records-header-actions">
          <a href="/">创建测试订单</a>
          <a href="/payment">返回支付测试</a>
          <a href="/statistics">信用点统计</a>
          <span className={`records-connection ${isLoading ? 'loading' : error ? 'failed' : hasQueried ? 'ready' : ''}`}>
            <span aria-hidden="true" />API {isLoading ? '查询中' : error ? '异常' : hasQueried ? '已连接' : '等待查询'}
          </span>
        </div>
      </header>

      <main className="records-main">
        <section className="records-context" aria-labelledby="records-context-title">
          <div className="context-heading">
            <div>
              <h2 id="records-context-title">查询上下文</h2>
              <p>身份与租户信息会应用到下方所有账务查询。</p>
            </div>
            <div className="context-meta">
              {authorization && (
                <button className="records-text-button" type="button" onClick={clearAuthorization}>
                  清除认证
                </button>
              )}
              <span>认证信息仅保存在当前标签页</span>
            </div>
          </div>
          <div className="context-grid">
            <label className="query-field context-authorization">
              <span>Authorization</span>
              <div className="records-secret">
                <input
                  type={showAuthorization ? 'text' : 'password'}
                  value={authorization}
                  onChange={(event) => {
                    setAuthorization(event.target.value)
                    clearResults()
                  }}
                  placeholder="md_pss_id sessionId"
                  autoComplete="off"
                />
                <button type="button" onClick={() => setShowAuthorization((current) => !current)}>
                  {showAuthorization ? '隐藏' : '显示'}
                </button>
              </div>
            </label>
            <label className="query-field">
              <span>Request ID</span>
              <input value={requestId} onChange={(event) => setRequestId(event.target.value)} />
            </label>
            <label className="query-field">
              <span>产品来源</span>
              <select value={productSource} onChange={(event) => {
                setProductSource(Number(event.target.value) as ProductSource)
                setProductCode(0)
                clearResults()
              }}>
                <option value={ProductSource.Hap}>{productSourceLabels[ProductSource.Hap]}</option>
                <option value={ProductSource.Hdp}>{productSourceLabels[ProductSource.Hdp]}</option>
              </select>
            </label>
            <label className="query-field">
              <span>Tenant ID</span>
              <input value={tenantId} onChange={(event) => {
                setTenantId(event.target.value)
                saveTenantId(event.target.value)
                clearResults()
              }} placeholder="输入租户 ID" />
            </label>
          </div>
        </section>

        <section className="records-workspace" aria-label="账务记录查询与结果">
          <div className="workspace-header">
            <nav className="records-tabs" aria-label="账务记录类型">
              <button type="button" className={activeTab === 'orders' ? 'active' : ''}
                onClick={() => changeTab('orders')}>订单记录</button>
              <button type="button" className={activeTab === 'credits' ? 'active' : ''}
                onClick={() => changeTab('credits')}>信用点明细</button>
              <button type="button" className={activeTab === 'refunds' ? 'active' : ''}
                onClick={() => changeTab('refunds')}>信用点退款</button>
            </nav>
            {activeTab !== 'orders' && balance && (
              <div className="workspace-balance" aria-label="当前信用点余额">
                <span>当前余额</span>
                <strong>{formatValue(balance.balance)}</strong>
                <small>{formatTime(balance.updatedAt)} 更新</small>
              </div>
            )}
          </div>

          <form className="workspace-controls" onSubmit={handleSubmit} noValidate>
            <div className="query-grid tab-query-grid">
              <label className="query-field">
                <span>开始时间</span>
                <input type="datetime-local" value={createdFrom}
                  onChange={(event) => setCreatedFrom(event.target.value)} />
              </label>
              <label className="query-field">
                <span>结束时间</span>
                <input type="datetime-local" value={createdTo}
                  onChange={(event) => setCreatedTo(event.target.value)} />
              </label>
            {activeTab === 'orders' ? (
              <>
                <label className="query-field">
                  <span>订单状态</span>
                  <select value={orderStatus} onChange={(event) => setOrderStatus(Number(event.target.value))}>
                    <option value={0}>全部</option>
                    {orderStatusOptions.map((value) => (
                      <option key={value} value={value}>{getEnumLabel(orderStatusLabels, value)}</option>
                    ))}
                  </select>
                </label>
                <label className="query-field query-field-wide">
                  <span>商品编码</span>
                  <select value={productCode} onChange={(event) => setProductCode(Number(event.target.value))}>
                    <option value={0}>全部</option>
                    {visibleProductCodes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="query-field">
                  <span>订单号</span>
                  <input value={orderNo} onChange={(event) => setOrderNo(event.target.value)}
                    placeholder="精确查询" />
                </label>
                <label className="query-field">
                  <span>创建人账户 ID</span>
                  <input value={creatorAccountId}
                    onChange={(event) => setCreatorAccountId(event.target.value)} />
                </label>
              </>
            ) : (
              <>
                <label className="query-field">
                  <span>交易类型</span>
                  <select value={activeTab === 'refunds'
                      ? CreditPointTransactionType.Refund
                      : transactionType}
                    disabled={activeTab === 'refunds'}
                    onChange={(event) => setTransactionType(
                      Number(event.target.value) as CreditPointTransactionType,
                    )}>
                    <option value={0}>全部</option>
                    {transactionTypeOptions.map((value) => (
                      <option key={value} value={value}>
                        {getEnumLabel(creditPointTransactionTypeLabels, value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="query-field">
                  <span>业务类型</span>
                  <select value={businessType} onChange={(event) => setBusinessType(
                    Number(event.target.value) as CreditPointBusinessType,
                  )}>
                    <option value={0}>全部</option>
                    {businessTypeOptions.map((value) => (
                      <option key={value} value={value}>
                        {getEnumLabel(creditPointBusinessTypeLabels, value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="query-field query-field-wide">
                  <span>操作人账户 ID</span>
                  <input value={operatorAccountId}
                    onChange={(event) => setOperatorAccountId(event.target.value)} />
                </label>
                <label className="query-field query-field-wide">
                  <span>扩展字段 JSON</span>
                  <input value={extensionFilters}
                    onChange={(event) => setExtensionFilters(event.target.value)}
                    placeholder='例如 {"workspaceId":"..."}' />
                </label>
              </>
            )}
            <label className="query-field">
              <span>每页数量</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
            <button className="records-submit" type="submit" disabled={isLoading}>
              {isLoading ? '正在查询…' : '查询记录'}
            </button>
            </div>
          </form>

          {error && <div className="records-message" role="alert"><strong>查询失败</strong><span>{error}</span></div>}

          <div className="records-results" aria-live="polite">
          <div className="results-heading">
            <h2>{activeTab === 'orders' ? '订单记录' : activeTab === 'credits' ? '信用点明细' : '信用点退款'}</h2>
            {currentPage && <span>共 {currentPage.totalCount} 条</span>}
          </div>

          {isLoading ? (
            <div className="records-state"><span className="records-loader" />正在读取账务数据…</div>
          ) : activeTab === 'orders' ? (
            <OrdersTable data={orders} selected={selectedOrder} onSelect={setSelectedOrder} hasQueried={hasQueried} />
          ) : (
            <CreditTable data={creditPoints} selected={selectedEntry} onSelect={setSelectedEntry}
              hasQueried={hasQueried} refundView={activeTab === 'refunds'} />
          )}

          {currentPage && currentPage.totalCount > 0 && (
            <div className="records-pagination">
              <button type="button" disabled={isLoading || currentPage.pageIndex <= 1}
                onClick={() => void loadRecords(currentPage.pageIndex - 1)}>上一页</button>
              <span>第 {currentPage.pageIndex} / {totalPages} 页</span>
              <button type="button" disabled={isLoading || currentPage.pageIndex >= totalPages}
                onClick={() => void loadRecords(currentPage.pageIndex + 1)}>下一页</button>
            </div>
          )}
          </div>
        </section>
      </main>
    </div>
  )
}

function OrdersTable({
  data,
  selected,
  onSelect,
  hasQueried,
}: {
  data: ListOrdersData | null
  selected: BillingOrder | null
  onSelect: (item: BillingOrder | null) => void
  hasQueried: boolean
}) {
  if (!data?.items.length) {
    return <EmptyState hasQueried={hasQueried} label="订单记录" />
  }
  return (
    <>
      <div className="records-table-wrap">
        <table className="records-table">
          <thead><tr>
            <th>下单时间</th><th>订单号 / ID</th><th>商品</th><th>金额</th>
            <th>订单状态</th><th>支付方式</th><th>创建人 / 付款人</th><th>操作</th>
          </tr></thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.orderId}>
                <td>{formatTime(item.createdAt)}</td>
                <td><strong>{item.orderNo || '—'}</strong><small>{item.orderId}</small></td>
                <td><strong>{item.item?.productName || '—'}</strong><small>{item.item?.productCode ?? '—'}</small></td>
                <td><strong>{formatValue(item.totalAmount, 2)}</strong></td>
                <td><span className="enum-label">{getEnumLabel(orderStatusLabels, item.orderStatus)}</span></td>
                <td><span className="enum-label">{getEnumLabel(paymentMethodLabels, item.paymentMethod)}</span></td>
                <td><strong>{item.creatorAccountId || '—'}</strong><small>{item.payerAccountId || '—'}</small></td>
                <td><button className="table-action" type="button"
                  onClick={() => onSelect(selected?.orderId === item.orderId ? null : item)}>
                  {selected?.orderId === item.orderId ? '收起' : '查看'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <OrderInspector order={selected} />}
    </>
  )
}

function CreditTable({
  data,
  selected,
  onSelect,
  hasQueried,
  refundView,
}: {
  data: GetListCreditPointsData | null
  selected: CreditPointEntry | null
  onSelect: (item: CreditPointEntry | null) => void
  hasQueried: boolean
  refundView: boolean
}) {
  if (!data?.items.length) {
    return <EmptyState hasQueried={hasQueried} label={refundView ? '退款流水' : '信用点明细'} />
  }
  return (
    <>
      <div className="records-table-wrap">
        <table className="records-table">
          <thead><tr>
            <th>创建时间</th><th>流水 ID</th>{refundView && <th>原支出流水 ID</th>}
            <th>交易类型</th><th>业务类型</th><th>变动值</th><th>变动后余额</th>
            <th>操作人 ID</th><th>备注</th><th>操作</th>
          </tr></thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>{formatTime(item.createdAt)}</td>
                <td className="mono-cell">{item.id}</td>
                {refundView && <td className="mono-cell">{item.originalEntryId || '—'}</td>}
                <td><span className="enum-label">
                  {getEnumLabel(creditPointTransactionTypeLabels, item.transactionType)}
                </span></td>
                <td><span className="enum-label">
                  {getEnumLabel(creditPointBusinessTypeLabels, item.businessType)}
                </span></td>
                <td><strong>{item.transactionType === CreditPointTransactionType.Expense ? '−' : '+'}{formatValue(item.amount)}</strong></td>
                <td>{formatValue(item.balanceAfter)}</td>
                <td className="mono-cell">{item.operatorAccountId || '—'}</td>
                <td>{item.remark || '—'}</td>
                <td><button className="table-action" type="button"
                  onClick={() => onSelect(selected?.id === item.id ? null : item)}>
                  {selected?.id === item.id ? '收起' : '查看'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <CreditInspector entry={selected} />}
    </>
  )
}

function EmptyState({ hasQueried, label }: { hasQueried: boolean; label: string }) {
  return (
    <div className="records-state empty">
      <strong>{hasQueried ? `没有符合条件的${label}` : `等待查询${label}`}</strong>
      <span>{hasQueried ? '请调整筛选条件后重新查询。' : '填写请求配置和筛选条件后开始查询。'}</span>
    </div>
  )
}

function OrderInspector({ order }: { order: BillingOrder }) {
  const fields: Array<[string, string | number]> = [
    ['订单 ID', order.orderId],
    ['Payment ID', order.paymentId || '—'],
    ['信用点流水 ID', order.creditPointEntryId || '—'],
    ['产品来源', getEnumLabel(productSourceLabels, order.productSource)],
    ['订单状态', getEnumLabel(orderStatusLabels, order.orderStatus)],
    ['支付方式', getEnumLabel(paymentMethodLabels, order.paymentMethod)],
    ['Tenant ID', order.tenantId],
    ['数量', order.item?.quantity ?? 0],
    ['单价', order.item?.unitPrice ?? 0],
    ['支付时间', formatTime(order.paidAt)],
    ['完成时间', formatTime(order.completedAt)],
    ['失败原因', order.failureReason || '—'],
  ]
  return <Inspector title={`订单详情 · ${order.orderNo}`} fields={fields}
    jsonLabel="Business Context" jsonValue={order.businessContext} />
}

function CreditInspector({ entry }: { entry: CreditPointEntry }) {
  const fields: Array<[string, string | number]> = [
    ['流水 ID', entry.id],
    ['原支出流水 ID', entry.originalEntryId || '—'],
    ['关联订单 ID', entry.orderId || '—'],
    ['操作人账户 ID', entry.operatorAccountId || '—'],
    ['交易类型', getEnumLabel(creditPointTransactionTypeLabels, entry.transactionType)],
    ['业务类型', getEnumLabel(creditPointBusinessTypeLabels, entry.businessType)],
    ['变动前余额', entry.balanceBefore],
    ['变动后余额', entry.balanceAfter],
    ['数量', entry.quantity],
    ['备注', entry.remark || '—'],
  ]
  return <Inspector title={`信用点流水详情 · ${entry.id}`} fields={fields}
    jsonLabel="Extension Data" jsonValue={entry.extensionData} />
}

function Inspector({
  title,
  fields,
  jsonLabel,
  jsonValue,
}: {
  title: string
  fields: Array<[string, string | number]>
  jsonLabel: string
  jsonValue?: Record<string, string>
}) {
  return (
    <aside className="record-inspector">
      <div><p>RAW RECORD</p><h3>{title}</h3></div>
      <dl>
        {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div className="inspector-json"><dt>{jsonLabel}</dt>
          <dd><pre>{JSON.stringify(jsonValue ?? {}, null, 2)}</pre></dd></div>
      </dl>
    </aside>
  )
}

export default RecordsPage
