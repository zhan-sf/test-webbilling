import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StatisticsPage from './StatisticsPage'
import { CreditPointBusinessType } from './types'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ code: 1, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mdApiResponse(data: unknown) {
  return new Response(JSON.stringify({ state: 1, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const page = { totalCount: 1, pageIndex: 1, pageSize: 200 }

describe('credit point statistics page', () => {
  it('loads overview and product-aware aggregate reports', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mdApiResponse({
        periodConsumption: 12.5,
        totalRecharge: 1000,
        totalConsumption: 320.75,
      }))
      .mockResolvedValueOnce(mdApiResponse({
        distribution: {
          items: [{
            businessType: CreditPointBusinessType.Aigc, extensionData: {}, totalAmount: 12.5,
            totalQuantity: 3, totalCount: 2, points: [],
          }], page,
        },
        scenes: {
          items: [{
            businessType: 0, extensionData: { mingoScene: '应用搭建' }, totalAmount: 4.5,
            totalQuantity: 1, totalCount: 1, points: [],
          }], page,
        },
        trend: {
          items: [{
            businessType: CreditPointBusinessType.Aigc, extensionData: {}, totalAmount: 12.5,
            totalQuantity: 3, totalCount: 2,
            points: [{ bucketStart: 1_753_142_400_000, amount: 12.5, quantity: 3, count: 2 }],
          }], page,
        },
        models: {
          items: [{
            businessType: 0, extensionData: { modelName: 'Qwen' }, totalAmount: 8,
            totalQuantity: 2, totalCount: 1,
            points: [{ bucketStart: 1_753_142_400_000, amount: 8, quantity: 2, count: 1 }],
          }], page,
        },
        applications: {
          items: [{
            businessType: CreditPointBusinessType.Aigc,
            extensionData: { appId: 'app-1' },
            totalAmount: 12.5, totalQuantity: 3, totalCount: 2, points: [],
            application: { appId: 'app-1', appName: '产品管理' },
          }], page,
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<StatisticsPage />)

    await user.type(screen.getByLabelText('Authorization'), 'md_pss_id session-token')
    await user.type(screen.getByLabelText('Tenant ID'), 'tenant-1')
    await user.click(screen.getByRole('button', { name: '生成统计' }))

    expect(await screen.findByText('1,000')).toBeInTheDocument()
    expect(screen.getByText('320.75')).toBeInTheDocument()
    expect(screen.getAllByText('AIGC').length).toBeGreaterThan(0)
    expect(screen.getByText('Qwen')).toBeInTheDocument()
    expect(screen.getByText('应用搭建')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('产品管理')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('app-1')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/mdapi/Billing/GetCreditPointOverview',
      '/mdapi/Billing/GetCreditPointStatisticsSummary',
    ])
    const summaryRequest = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(summaryRequest).toEqual(expect.objectContaining({
      projectId: 'tenant-1',
      createdFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      createdTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
    const orderedHeadings = [
      '信用点消费类型分布',
      'Mingo 场景汇总',
      '信用点消费趋势',
      'AI 模型（AIGC）消费趋势',
      '应用消费汇总',
    ].map((name) => screen.getByRole('heading', { name }))
    orderedHeadings.slice(1).forEach((heading, index) => {
      expect(orderedHeadings[index].compareDocumentPosition(heading)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('switches HDP statistics to workspace and resource dimensions', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({
      items: [],
      page: { totalCount: 0, pageIndex: 1, pageSize: 200 },
    })))
    fetchMock.mockResolvedValueOnce(jsonResponse({
      periodConsumption: 0,
      totalRecharge: 0,
      totalConsumption: 0,
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<StatisticsPage />)

    await user.type(screen.getByLabelText('Authorization'), 'md_pss_id session-token')
    await user.selectOptions(screen.getByLabelText('产品来源'), '2')
    await user.type(screen.getByLabelText('Tenant ID'), 'tenant-1')
    await user.click(screen.getByRole('button', { name: '生成统计' }))

    await screen.findByText('资源场景汇总')
    const sceneRequest = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))
    const appRequest = JSON.parse(String((fetchMock.mock.calls[5][1] as RequestInit).body))
    expect(appRequest.groupByExtensionField).toBe('workspaceId')
    expect(sceneRequest.groupByExtensionField).toBe('resourceType')
  })
})
