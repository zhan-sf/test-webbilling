import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type ApplicationCreditPointStatisticsData,
  type CreditPointBusinessType,
  type CreditPointStatisticSeries,
  type GetCreditPointStatisticsData,
} from './types'
import { creditPointBusinessTypeLabels, getEnumLabel } from './enumLabels'
import { formatCreditPoints } from './ui'

const chartInitialDimension = { width: 720, height: 300 }

function formatBucket(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(timestamp))
}

function colorForKey(key: string) {
  let hash = 2_166_136_261
  for (const character of key) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619) >>> 0
  }
  return `hsl(${hash % 360} 66% 48%)`
}

function ReportEmpty({ text }: { text: string }) {
  return <div className="report-empty"><span aria-hidden="true">—</span><p>{text}</p></div>
}

function ChartLegend({ items }: { items: Array<{ key: string; label: string; color: string }> }) {
  return <div className="chart-legend" aria-label="图例">
    {items.map((item) => <span key={item.key}>
      <i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}
    </span>)}
  </div>
}

export function ConsumptionTypeDonut({ data }: { data: GetCreditPointStatisticsData | null }) {
  const items = (data?.items ?? []).filter((item) => item.totalAmount > 0)
  const chartData = items.map((item) => ({
    name: getEnumLabel(creditPointBusinessTypeLabels, item.businessType),
    value: item.totalAmount,
    key: `business:${item.businessType}`,
    color: colorForKey(`business:${item.businessType}`),
  }))
  const total = chartData.reduce((sum, item) => sum + item.value, 0)

  return <section className="chart-panel distribution-panel" aria-labelledby="distribution-title">
    <div className="report-heading">
      <div><h2 id="distribution-title">信用点消费类型分布</h2><p>按业务类型汇总消费信用点</p></div>
      <strong>{formatCreditPoints(total)}</strong>
    </div>
    {chartData.length ? <>
      <div className="chart-canvas chart-canvas-donut" role="img" aria-label="信用点消费类型环形图">
        <ResponsiveContainer width="100%" height="100%" initialDimension={chartInitialDimension}>
          <PieChart accessibilityLayer>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="78%"
              paddingAngle={1} stroke="var(--color-bg)" strokeWidth={2} isAnimationActive={false}>
              {chartData.map((item) => <Cell key={item.key} fill={item.color} />)}
              <Label value={formatCreditPoints(total)} position="center" className="donut-total" />
            </Pie>
            <Tooltip formatter={(value, name) => [`${formatCreditPoints(Number(value))} 信用点`, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="donut-legend">
        {chartData.map((item) => <div key={item.key}>
          <span><i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.name}</span>
          <strong>{formatCreditPoints(item.value)}</strong>
        </div>)}
      </div>
    </> : <ReportEmpty text="该时间范围内没有信用点消费类型数据。" />}
  </section>
}

export function SceneConsumptionBar({
  data,
  field,
  title,
}: {
  data: GetCreditPointStatisticsData | null
  field: string
  title: string
}) {
  const chartData = (data?.items ?? [])
    .filter((item) => item.extensionData[field])
    .map((item) => ({ name: item.extensionData[field], amount: item.totalAmount }))
  const total = chartData.reduce((sum, item) => sum + item.amount, 0)
  const minWidth = Math.max(640, chartData.length * 104)

  return <section className="chart-panel scene-panel" aria-labelledby="scene-title">
    <div className="report-heading">
      <div><h2 id="scene-title">{title}</h2><p>按场景汇总消费信用点</p></div>
      <strong>{formatCreditPoints(total)}</strong>
    </div>
    {chartData.length ? <div className="chart-scroll" role="img" aria-label={`${title}柱状图`}>
      <div className="chart-canvas" style={{ minWidth }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={chartInitialDimension}>
          <BarChart data={chartData} accessibilityLayer margin={{ top: 12, right: 16, left: 0, bottom: 16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} />
            <YAxis tickLine={false} axisLine={false} width={52} />
            <Tooltip formatter={(value) => [`${formatCreditPoints(Number(value))} 信用点`, '消费']} />
            <Bar dataKey="amount" name="消费" fill="var(--color-primary-strong)" radius={[5, 5, 0, 0]}
              isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div> : <ReportEmpty text={`暂无包含 ${field} 的信用点流水。`} />}
  </section>
}

interface TrendSeries {
  key: string
  label: string
  color: string
  source: CreditPointStatisticSeries
}

function buildTrendData(series: TrendSeries[]) {
  const timestamps = [...new Set(series.flatMap((item) =>
    item.source.points.map((point) => point.bucketStart)))].sort((left, right) => left - right)
  return timestamps.map((timestamp) => {
    const row: Record<string, number> = { bucketStart: timestamp }
    for (const item of series) {
      row[item.key] = item.source.points.find((point) => point.bucketStart === timestamp)?.amount ?? 0
    }
    return row
  })
}

function TrendReport({
  data,
  title,
  subtitle,
  getSeriesLabel,
  seriesPrefix,
}: {
  data: GetCreditPointStatisticsData | null
  title: string
  subtitle: string
  getSeriesLabel: (series: CreditPointStatisticSeries) => string
  seriesPrefix: string
}) {
  const series = useMemo(() => (data?.items ?? [])
    .map((source, index) => {
      const label = getSeriesLabel(source)
      const stableKey = `${seriesPrefix}:${label || index}`
      return { key: `series_${index}`, label, color: colorForKey(stableKey), source }
    })
    .filter((item) => item.label), [data, getSeriesLabel, seriesPrefix])
  const chartData = useMemo(() => buildTrendData(series), [series])
  const total = series.reduce((sum, item) => sum + item.source.totalAmount, 0)
  const minWidth = Math.max(760, chartData.length * 32)

  return <section className="chart-panel trend-report" aria-label={title}>
    <div className="report-heading trend-heading">
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      <strong>总计 {formatCreditPoints(total)}</strong>
    </div>
    {chartData.length && series.length ? <>
      <ChartLegend items={series} />
      <div className="chart-scroll" role="img" aria-label={`${title}折线图`}>
        <div className="chart-canvas chart-canvas-line" style={{ minWidth }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={chartInitialDimension}>
            <LineChart data={chartData} accessibilityLayer margin={{ top: 18, right: 18, left: 0, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="bucketStart" tickFormatter={(value) => formatBucket(Number(value))}
                tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} width={52} />
              <Tooltip labelFormatter={(value) => formatBucket(Number(value))}
                formatter={(value, name) => [`${formatCreditPoints(Number(value))} 信用点`, name]} />
              {series.map((item) => <Line key={item.key} type="monotone" dataKey={item.key}
                name={item.label} stroke={item.color} strokeWidth={2} dot={false}
                activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </> : <ReportEmpty text={`该时间范围内没有${title}数据。`} />}
  </section>
}

export function BusinessConsumptionTrend({ data }: { data: GetCreditPointStatisticsData | null }) {
  return <TrendReport data={data} title="信用点消费趋势" subtitle="按业务类型查看每日消费变化"
    seriesPrefix="business" getSeriesLabel={(series) =>
      getEnumLabel(creditPointBusinessTypeLabels, series.businessType)} />
}

export function ModelConsumptionTrend({ data }: { data: GetCreditPointStatisticsData | null }) {
  return <TrendReport data={data} title="AI 模型（AIGC）消费趋势" subtitle="按模型查看每日消费变化"
    seriesPrefix="model" getSeriesLabel={(series) => series.extensionData.modelName ?? ''} />
}

interface ApplicationRow {
  id: string
  name: string
  total: number
  types: Map<CreditPointBusinessType, number>
}

export function ApplicationConsumptionTable({
  data,
  applicationField,
  applicationLabel,
}: {
  data: ApplicationCreditPointStatisticsData | null
  applicationField: string
  applicationLabel: string
}) {
  const rows = useMemo(() => {
    const grouped = new Map<string, ApplicationRow>()
    for (const series of data?.items ?? []) {
      const id = series.extensionData[applicationField] || '未关联'
      const row = grouped.get(id) ?? {
        id,
        name: series.application?.appName?.trim() || id,
        total: 0,
        types: new Map<CreditPointBusinessType, number>(),
      }
      if (series.application?.appName?.trim()) row.name = series.application.appName.trim()
      row.total += series.totalAmount
      row.types.set(series.businessType,
        (row.types.get(series.businessType) ?? 0) + series.totalAmount)
      grouped.set(id, row)
    }
    return [...grouped.values()].sort((left, right) => right.total - left.total)
  }, [applicationField, data])
  const businessTypes = useMemo(() => [...new Set((data?.items ?? [])
    .map((item) => item.businessType).filter(Boolean))].sort((left, right) => left - right), [data])

  return <section className="application-summary" aria-labelledby="application-summary-title">
    <div className="report-heading">
      <div><h2 id="application-summary-title">应用消费汇总</h2><p>按应用和业务类型核对信用点归属</p></div>
      <strong>{rows.length} 个统计对象</strong>
    </div>
    {rows.length ? <div className="statistics-table-wrap">
      <table>
        <thead><tr><th>{applicationLabel}</th><th>总消费</th>
          {businessTypes.map((type) => <th key={type}>
            {getEnumLabel(creditPointBusinessTypeLabels, type)}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td><strong>{row.name}</strong>{row.name !== row.id && <small>{row.id}</small>}</td>
          <td>{formatCreditPoints(row.total)}</td>
          {businessTypes.map((type) => <td key={type}>
            {formatCreditPoints(row.types.get(type) ?? 0)}</td>)}
        </tr>)}</tbody>
      </table>
    </div> : <ReportEmpty text="暂无包含应用或工作空间标识的信用点流水。" />}
  </section>
}
