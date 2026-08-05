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
  getCreditPointStatisticsSummary,
} from './api'
import {
  ProductSource,
  type CreditPointOverview,
  type CreditPointStatisticsSummary,
} from './types'
import {
  getEnumLabel,
  productSourceLabels,
} from './enumLabels'
import {
  ApplicationConsumptionTable,
  BusinessConsumptionTrend,
  ConsumptionTypeDonut,
  ModelConsumptionTrend,
  SceneConsumptionBar,
} from './StatisticsCharts'
import {
  AUTHORIZATION_STORAGE_KEY,
  formatCreditPoints,
  saveTenantId,
  TENANT_ID_STORAGE_KEY,
} from './ui'
import './StatisticsPage.css'

const requestId = 'MDBillingPaymentWeb'
const utc8OffsetMilliseconds = 8 * 60 * 60 * 1000

function initialPeriod() {
  const today = new Date(Date.now() + utc8OffsetMilliseconds)
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - 29)
  const to = new Date(today)
  to.setUTCDate(to.getUTCDate() + 1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Authorization 无效或已过期，请重新填写后统计。'
  }
  if (error instanceof Error && error.name !== 'AbortError') return error.message
  return ''
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
  const [summary, setSummary] = useState<CreditPointStatisticsSummary | null>(null)
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
    setSummary(null)
    setHasQueried(false)
    setError('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedAuthorization = authorization.trim()
    const normalizedTenantId = tenantId.trim()
    const from = createdFrom
    const to = createdTo
    if (!authorizationIsValid) {
      setError('Authorization 格式应为 md_pss_id {sessionId}。')
      return
    }
    if (!normalizedTenantId) {
      setError('请填写 Tenant ID。')
      return
    }
    if (!from || !to || from >= to) {
      setError('结束日期必须晚于开始日期，并且不包含结束日期当天。')
      return
    }
    const rangeMilliseconds = Date.parse(`${to}T00:00:00+08:00`)
      - Date.parse(`${from}T00:00:00+08:00`)
    if (rangeMilliseconds > 366 * 86_400_000) {
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

    try {
      const query = {
        requestId,
        productSource,
        tenantId: normalizedTenantId,
        createdFrom: from,
        createdTo: to,
      }
      const [overviewResult, summaryResult] = await Promise.all([
        getCreditPointOverview(query, normalizedAuthorization, controller.signal),
        getCreditPointStatisticsSummary(query, normalizedAuthorization, controller.signal),
      ])
      setOverview(overviewResult)
      setSummary(summaryResult)
    } catch (requestError) {
      if (!(requestError instanceof Error && requestError.name === 'AbortError')) {
        setError(getErrorMessage(requestError))
      }
    } finally {
      setIsLoading(false)
    }
  }

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
              <p>累计值读取全部账务流水；UTC+8 日期范围只控制区间消费与趋势。</p>
            </div>
            <span>{getEnumLabel(productSourceLabels, productSource)} · 按 UTC+8 自然日分桶</span>
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
              <span>开始日期</span>
              <input type="date" value={createdFrom}
                onChange={(event) => {
                  setCreatedFrom(event.target.value)
                  clearResults()
                }} />
            </label>
            <label className="statistics-field">
              <span>结束日期（不含）</span>
              <input type="date" value={createdTo}
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

        {isLoading ? <StatisticsLoading /> : overview && summary ? (
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

            <section className="statistics-analysis" aria-label="消费构成与场景汇总">
              <ConsumptionTypeDonut data={summary.distribution} />
              <SceneConsumptionBar data={summary.scenes} field={sceneField} title={sceneTitle} />
            </section>

            <BusinessConsumptionTrend data={summary.trend} />

            <ModelConsumptionTrend data={summary.models} />

            <ApplicationConsumptionTable data={summary.applications}
              applicationField={applicationField}
              applicationLabel={productSource === ProductSource.Hap ? '应用名称' : '工作空间'} />
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

function StatisticsLoading() {
  return <div className="statistics-loading" role="status" aria-label="正在加载信用点统计">
    <div /><div /><div />
  </div>
}

export default StatisticsPage
