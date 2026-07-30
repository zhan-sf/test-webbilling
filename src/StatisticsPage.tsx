/*
THESIS: A billing ledger report, not a generic dashboard of detached metric cards.
OWN-WORLD: White ledger surface, neutral query rail, honey-amber selection and precise tabular data.
STORY: Connect a tenant, define one period, then read totals, composition, movement and product dimensions.
FIRST VIEWPORT: Shared request context first, followed by a single ruled overview band and the main trend.
FORM: Established MD Billing operate surface, extending the records workspace without a new visual system.
*/
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  getCreditPointOverview,
  getCreditPointStatistics,
} from './api'
import {
  CreditPointStatisticGranularity,
  CreditPointStatisticRefundFilter,
  CreditPointBusinessType,
  CreditPointTransactionType,
  ProductSource,
  type CreditPointOverview,
  type GetCreditPointStatisticsData,
} from './types'
import {
  creditPointBusinessTypeLabels,
  getEnumLabel,
  productSourceLabels,
} from './enumLabels'
import {
  AUTHORIZATION_STORAGE_KEY,
  formatCreditPoints,
  saveTenantId,
  TENANT_ID_STORAGE_KEY,
} from './ui'
import './StatisticsPage.css'

const requestId = 'MDBillingPaymentWeb'

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function initialPeriod() {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  from.setHours(0, 0, 0, 0)
  return { from: toLocalInput(from), to: toLocalInput(to) }
}

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatBucket(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
    .format(new Date(timestamp))
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Authorization 无效或已过期，请重新填写后统计。'
  }
  if (error instanceof Error && error.name !== 'AbortError') return error.message
  return ''
}

interface DimensionReport {
  title: string
  field: string
  data: GetCreditPointStatisticsData | null
}

function StatisticsPage() {
  const period = useMemo(initialPeriod, [])
  const [authorization, setAuthorization] = useState(
    () => sessionStorage.getItem(AUTHORIZATION_STORAGE_KEY) ?? '',
  )
  const [showAuthorization, setShowAuthorization] = useState(false)
  const [productSource, setProductSource] = useState<ProductSource>(ProductSource.Hap)
  const [tenantId, setTenantId] = useState(
    () => sessionStorage.getItem(TENANT_ID_STORAGE_KEY) ?? '',
  )
  const [createdFrom, setCreatedFrom] = useState(period.from)
  const [createdTo, setCreatedTo] = useState(period.to)
  const [overview, setOverview] = useState<CreditPointOverview | null>(null)
  const [distribution, setDistribution] = useState<GetCreditPointStatisticsData | null>(null)
  const [trend, setTrend] = useState<GetCreditPointStatisticsData | null>(null)
  const [applications, setApplications] = useState<GetCreditPointStatisticsData | null>(null)
  const [models, setModels] = useState<GetCreditPointStatisticsData | null>(null)
  const [scenes, setScenes] = useState<GetCreditPointStatisticsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasQueried, setHasQueried] = useState(false)
  const [error, setError] = useState('')
  const requestController = useRef<AbortController | null>(null)

  const authorizationIsValid = /^md_pss_id\s+\S+$/.test(authorization.trim())
  const applicationField = productSource === ProductSource.Hap ? 'appId' : 'workspaceId'
  const sceneField = productSource === ProductSource.Hap ? 'mingoScene' : 'resourceType'
  const sceneTitle = productSource === ProductSource.Hap ? 'Mingo 场景汇总' : '资源场景汇总'

  useEffect(() => () => requestController.current?.abort(), [])

  const clearResults = () => {
    setOverview(null)
    setDistribution(null)
    setTrend(null)
    setApplications(null)
    setModels(null)
    setScenes(null)
    setHasQueried(false)
    setError('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedAuthorization = authorization.trim()
    const normalizedTenantId = tenantId.trim()
    const from = toTimestamp(createdFrom)
    const to = toTimestamp(createdTo)
    if (!authorizationIsValid) {
      setError('Authorization 格式应为 md_pss_id {sessionId}。')
      return
    }
    if (!normalizedTenantId) {
      setError('请填写 Tenant ID。')
      return
    }
    if (!from || !to || from > to) {
      setError('请选择有效的统计开始时间和结束时间。')
      return
    }
    if (to - from > 366 * 86_400_000) {
      setError('按天趋势最多查询 366 天，请缩短统计范围。')
      return
    }

    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    sessionStorage.setItem(AUTHORIZATION_STORAGE_KEY, normalizedAuthorization)
    saveTenantId(normalizedTenantId)
    setIsLoading(true)
    setHasQueried(true)
    setError('')

    const common = {
      requestId,
      productSource,
      tenantId: normalizedTenantId,
      transactionType: CreditPointTransactionType.Expense,
      businessTypes: [] as CreditPointBusinessType[],
      createdFrom: from,
      createdTo: to,
      extensionFilters: {},
      refundFilter: CreditPointStatisticRefundFilter.ExcludeRefunds,
      page: { pageIndex: 1, pageSize: 200 },
    }
    const aggregate = (
      groupByBusinessType: boolean,
      groupByExtensionField: string,
      granularity: CreditPointStatisticGranularity,
      businessTypes: CreditPointBusinessType[] = [],
    ) => getCreditPointStatistics({
      ...common,
      businessTypes,
      groupByBusinessType,
      groupByExtensionField,
      granularity,
    }, normalizedAuthorization, controller.signal)

    try {
      const [overviewResult, distributionResult, trendResult, applicationResult, modelResult, sceneResult]
        = await Promise.all([
          getCreditPointOverview({
            requestId,
            productSource,
            tenantId: normalizedTenantId,
            createdFrom: from,
            createdTo: to,
          }, normalizedAuthorization, controller.signal),
          aggregate(true, '', CreditPointStatisticGranularity.None),
          aggregate(true, '', CreditPointStatisticGranularity.Day),
          aggregate(true, applicationField, CreditPointStatisticGranularity.None),
          aggregate(false, 'modelName', CreditPointStatisticGranularity.Day,
            [CreditPointBusinessType.Aigc]),
          aggregate(false, sceneField, CreditPointStatisticGranularity.None),
        ])
      setOverview(overviewResult)
      setDistribution(distributionResult)
      setTrend(trendResult)
      setApplications(applicationResult)
      setModels(modelResult)
      setScenes(sceneResult)
    } catch (requestError) {
      if (!(requestError instanceof Error && requestError.name === 'AbortError')) {
        setError(getErrorMessage(requestError))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const trendPoints = useMemo(() => {
    const buckets = new Map<number, number>()
    for (const series of trend?.items ?? []) {
      for (const point of series.points) {
        buckets.set(point.bucketStart, (buckets.get(point.bucketStart) ?? 0) + point.amount)
      }
    }
    return [...buckets.entries()].sort(([left], [right]) => left - right)
  }, [trend])

  const applicationRows = useMemo(() => {
    const rows = new Map<string, ApplicationRow>()
    for (const series of applications?.items ?? []) {
      const key = series.extensionData[applicationField] || '未关联'
      const row = rows.get(key) ?? {
        total: 0,
        types: new Map<CreditPointBusinessType, number>(),
      }
      row.total += series.totalAmount
      row.types.set(series.businessType,
        (row.types.get(series.businessType) ?? 0) + series.totalAmount)
      rows.set(key, row)
    }
    return [...rows.entries()].sort((left, right) => right[1].total - left[1].total)
  }, [applicationField, applications])

  const businessTypes = useMemo(() => {
    const values = new Set<CreditPointBusinessType>()
    for (const series of applications?.items ?? []) {
      if (series.businessType) values.add(series.businessType)
    }
    return [...values].sort((left, right) => left - right)
  }, [applications])

  const dimensionReports: DimensionReport[] = [
    { title: 'AI 模型消费趋势', field: 'modelName', data: models },
    { title: sceneTitle, field: sceneField, data: scenes },
  ]

  return (
    <div className="statistics-shell">
      <header className="statistics-header">
        <div>
          <p>MD Billing</p>
          <h1>信用点统计测试台</h1>
        </div>
        <nav aria-label="账务测试页面">
          <a href="/">创建订单</a>
          <a href="/payment">支付测试</a>
          <a href="/records">账务记录</a>
          <span className={`statistics-connection ${isLoading ? 'loading' : error ? 'failed' : hasQueried ? 'ready' : ''}`}>
            <span aria-hidden="true" />
            API {isLoading ? '统计中' : error ? '异常' : hasQueried ? '已连接' : '等待查询'}
          </span>
        </nav>
      </header>

      <main className="statistics-main">
        <section className="statistics-query" aria-labelledby="statistics-query-title">
          <div className="statistics-query-heading">
            <div>
              <h2 id="statistics-query-title">统计上下文</h2>
              <p>累计值读取全部账务流水；日期范围只控制区间消费与趋势。</p>
            </div>
            <span>{getEnumLabel(productSourceLabels, productSource)} · 固定日桶从开始时间切分</span>
          </div>
          <form onSubmit={handleSubmit}>
            <label className="statistics-field statistics-auth">
              <span>Authorization</span>
              <div>
                <input type={showAuthorization ? 'text' : 'password'} value={authorization}
                  onChange={(event) => {
                    setAuthorization(event.target.value)
                    clearResults()
                  }}
                  placeholder="md_pss_id 09f0410b..." autoComplete="off" spellCheck={false} />
                <button type="button" onClick={() => setShowAuthorization((current) => !current)}>
                  {showAuthorization ? '隐藏' : '显示'}
                </button>
              </div>
            </label>
            <label className="statistics-field">
              <span>产品来源</span>
              <select value={productSource} onChange={(event) => {
                setProductSource(Number(event.target.value) as ProductSource)
                clearResults()
              }}>
                <option value={ProductSource.Hap}>HAP</option>
                <option value={ProductSource.Hdp}>HDP</option>
              </select>
            </label>
            <label className="statistics-field">
              <span>Tenant ID</span>
              <input value={tenantId} onChange={(event) => {
                setTenantId(event.target.value)
                saveTenantId(event.target.value)
                clearResults()
              }} placeholder="输入租户 GUID" autoComplete="off" />
            </label>
            <label className="statistics-field">
              <span>开始时间</span>
              <input type="datetime-local" value={createdFrom}
                onChange={(event) => {
                  setCreatedFrom(event.target.value)
                  clearResults()
                }} />
            </label>
            <label className="statistics-field">
              <span>结束时间</span>
              <input type="datetime-local" value={createdTo}
                onChange={(event) => {
                  setCreatedTo(event.target.value)
                  clearResults()
                }} />
            </label>
            <button className="statistics-submit" type="submit" disabled={isLoading}>
              {isLoading ? '正在聚合…' : '生成统计'}
            </button>
          </form>
        </section>

        {error && <div className="statistics-error" role="alert">
          <strong>统计未完成</strong><span>{error}</span>
        </div>}

        {isLoading ? <StatisticsLoading /> : overview ? (
          <>
            <section className="overview-ledger" aria-labelledby="overview-title">
              <div className="overview-heading">
                <p>信用点概览</p>
                <h2 id="overview-title">从期间变化看到累计规模</h2>
              </div>
              <dl>
                <div><dt>区间消费</dt><dd>{formatCreditPoints(overview.periodConsumption)}</dd>
                  <small>信用点</small></div>
                <div><dt>累计充值</dt><dd>{formatCreditPoints(overview.totalRecharge)}</dd>
                  <small>信用点</small></div>
                <div><dt>累计消费</dt><dd>{formatCreditPoints(overview.totalConsumption)}</dd>
                  <small>信用点</small></div>
              </dl>
            </section>

            <section className="statistics-analysis">
              <TypeDistribution data={distribution} />
              <TrendChart points={trendPoints} />
            </section>

            <section className="dimension-analysis" aria-label="产品扩展维度统计">
              {dimensionReports.map((report) => (
                <DimensionSummary key={report.field} {...report} />
              ))}
            </section>

            <ApplicationSummary rows={applicationRows} businessTypes={businessTypes}
              applicationLabel={productSource === ProductSource.Hap ? '应用 ID' : '工作空间 ID'} />
          </>
        ) : !error && (
          <section className="statistics-empty">
            <strong>连接租户后查看统计事实</strong>
            <p>系统会在 MongoDB 内完成聚合，只把概览、分组和趋势结果返回到当前页面。</p>
          </section>
        )}
      </main>
    </div>
  )
}

function TypeDistribution({ data }: { data: GetCreditPointStatisticsData | null }) {
  const items = data?.items ?? []
  const max = Math.max(...items.map((item) => item.totalAmount), 1)
  return (
    <section className="distribution-panel" aria-labelledby="distribution-title">
      <div className="report-heading">
        <div><p>构成</p><h2 id="distribution-title">消费类型分布</h2></div>
        <span>{items.length} 个业务类型</span>
      </div>
      {items.length ? <ol className="distribution-list">
        {items.map((item) => (
          <li key={item.businessType}>
            <div><strong>{getEnumLabel(creditPointBusinessTypeLabels, item.businessType)}</strong>
              <span>{formatCreditPoints(item.totalAmount)}</span></div>
            <span className="distribution-track" aria-hidden="true">
              <i style={{ width: `${Math.max(2, item.totalAmount / max * 100)}%` }} />
            </span>
          </li>
        ))}
      </ol> : <ReportEmpty text="该时间范围内没有消费类型数据。" />}
    </section>
  )
}

function TrendChart({ points }: { points: Array<[number, number]> }) {
  const max = Math.max(...points.map(([, amount]) => amount), 1)
  return (
    <section className="trend-panel" aria-labelledby="trend-title">
      <div className="report-heading">
        <div><p>变化</p><h2 id="trend-title">每日信用点消费</h2></div>
        <span>{points.length} 个时间桶</span>
      </div>
      {points.length ? <div className="trend-chart" role="img" aria-label="每日信用点消费柱状图">
        {points.map(([timestamp, amount], index) => (
          <div className="trend-column" key={timestamp}
            title={`${formatBucket(timestamp)} · ${formatCreditPoints(amount)} 信用点`}>
            <span className="trend-value">{formatCreditPoints(amount)}</span>
            <i style={{ height: `${Math.max(3, amount / max * 100)}%` }} />
            <small>{index === 0 || index === points.length - 1 || points.length <= 8
              ? formatBucket(timestamp) : ''}</small>
          </div>
        ))}
      </div> : <ReportEmpty text="该时间范围内没有可绘制的消费趋势。" />}
    </section>
  )
}

function DimensionSummary({ title, field, data }: DimensionReport) {
  const items = (data?.items ?? []).filter((item) => item.extensionData[field])
  const max = Math.max(...items.map((item) => item.totalAmount), 1)
  const hasTrend = items.some((item) => item.points.length > 0)
  return (
    <section className="dimension-panel">
      <div className="report-heading">
        <div><p>扩展维度</p><h2>{title}</h2></div>
        <span>{items.length} 组</span>
      </div>
      {items.length ? <ul>
        {items.slice(0, 8).map((item) => (
          <li key={item.extensionData[field]}>
            <div><strong>{item.extensionData[field]}</strong>
              <span>{formatCreditPoints(item.totalAmount)}</span></div>
            {hasTrend ? <MiniTrend points={item.points.map((point) => point.amount)}
              label={`${item.extensionData[field]} 每日信用点消费趋势`} /> :
              <span><i style={{ width: `${Math.max(2, item.totalAmount / max * 100)}%` }} /></span>}
          </li>
        ))}
      </ul> : <ReportEmpty text={`暂无包含 ${field} 的信用点流水。`} />}
    </section>
  )
}

function MiniTrend({ points, label }: { points: number[]; label: string }) {
  const max = Math.max(...points, 1)
  return <span className="mini-trend" role="img" aria-label={label}>
    {points.map((amount, index) => <i key={index}
      style={{ height: `${Math.max(8, amount / max * 100)}%` }} />)}
  </span>
}

interface ApplicationRow {
  total: number
  types: Map<CreditPointBusinessType, number>
}

function ApplicationSummary({
  rows,
  businessTypes,
  applicationLabel,
}: {
  rows: Array<[string, ApplicationRow]>
  businessTypes: CreditPointBusinessType[]
  applicationLabel: string
}) {
  return (
    <section className="application-summary" aria-labelledby="application-summary-title">
      <div className="report-heading">
        <div><p>归属</p><h2 id="application-summary-title">应用消费汇总</h2></div>
        <span>{rows.length} 个统计对象</span>
      </div>
      {rows.length ? <div className="statistics-table-wrap">
        <table>
          <thead><tr><th>{applicationLabel}</th><th>总消费</th>
            {businessTypes.map((type) => <th key={type}>
              {getEnumLabel(creditPointBusinessTypeLabels, type)}</th>)}</tr></thead>
          <tbody>{rows.map(([key, row]) => <tr key={key}>
            <td><strong>{key}</strong></td>
            <td>{formatCreditPoints(row.total)}</td>
            {businessTypes.map((type) => <td key={type}>
              {formatCreditPoints(row.types.get(type) ?? 0)}</td>)}
          </tr>)}</tbody>
        </table>
      </div> : <ReportEmpty text="暂无包含应用或工作空间标识的信用点流水。" />}
    </section>
  )
}

function ReportEmpty({ text }: { text: string }) {
  return <div className="report-empty"><span aria-hidden="true">—</span><p>{text}</p></div>
}

function StatisticsLoading() {
  return <div className="statistics-loading" role="status" aria-label="正在加载信用点统计">
    <div /><div /><div />
  </div>
}

export default StatisticsPage
