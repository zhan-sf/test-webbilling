import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ApiError, createPayment, getOrder, getSafeRedirectUrl } from './api'
import {
  BillingOrderStatus,
  BillingPaymentActionType,
  BillingPaymentMethod,
  type CreatePaymentResponse,
  type GetPaymentOrderResponse,
  type PaymentQuery,
} from './types'
import { getEnumLabel, orderStatusLabels, paymentMethodLabels } from './enumLabels'
import {
  AUTHORIZATION_STORAGE_KEY,
  formatAmount,
  saveTenantId,
  TENANT_ID_STORAGE_KEY,
} from './ui'
import './App.css'

const paymentMethods = {
  [BillingPaymentMethod.Alipay]: {
    name: paymentMethodLabels[BillingPaymentMethod.Alipay],
    description: '跳转到支付宝网页完成付款', mark: '支', tone: 'alipay',
  },
  [BillingPaymentMethod.WechatPay]: {
    name: paymentMethodLabels[BillingPaymentMethod.WechatPay],
    description: '生成 Native 支付二维码', mark: '微', tone: 'wechat',
  },
  [BillingPaymentMethod.CreditPoint]: {
    name: paymentMethodLabels[BillingPaymentMethod.CreditPoint],
    description: '直接从当前租户信用点余额扣除', mark: '点', tone: 'credit',
  },
} as const

const terminalStatuses = new Set<BillingOrderStatus>([
  BillingOrderStatus.Paid,
  BillingOrderStatus.Completed,
])

function parseInitialQuery(): PaymentQuery {
  const params = new URLSearchParams(window.location.search)
  return {
    tenantId: params.get('tenantId') ?? sessionStorage.getItem(TENANT_ID_STORAGE_KEY) ?? '',
    orderId: params.get('orderId') ?? '',
  }
}

function getAlipayReturnUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('paymentReturn', 'alipay')
  return url.toString()
}

function formatTime(timestamp: number) {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hour12: false,
  }).format(new Date(timestamp))
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Authorization 无效或已过期，请重新填写后查询。'
  }
  if (error instanceof Error && error.name !== 'AbortError') return error.message
  return ''
}

function App() {
  const [query, setQuery] = useState<PaymentQuery>(parseInitialQuery)
  const [authorization, setAuthorization] = useState(
    () => sessionStorage.getItem(AUTHORIZATION_STORAGE_KEY) ?? '',
  )
  const [showAuthorization, setShowAuthorization] = useState(false)
  const [order, setOrder] = useState<GetPaymentOrderResponse | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<BillingPaymentMethod | null>(null)
  const [paymentAction, setPaymentAction] = useState<CreatePaymentResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialogNotice, setDialogNotice] = useState('')
  const [now, setNow] = useState(Date.now())
  const requestController = useRef<AbortController | null>(null)
  const paymentDialogRef = useRef<HTMLDivElement | null>(null)

  const authorizationIsValid = /^md_pss_id\s+\S+$/.test(authorization.trim())
  const queryIsComplete = Boolean(query.tenantId.trim() && query.orderId.trim())

  const clearLoadedOrder = () => {
    setOrder(null)
    setSelectedMethod(null)
    setPaymentAction(null)
    setIsPaymentDialogOpen(false)
    setError('')
    setNotice('')
    setDialogNotice('')
  }

  const updateQuery = (changes: Partial<PaymentQuery>) => {
    setQuery((current) => ({ ...current, ...changes }))
    clearLoadedOrder()
  }

  const syncUrl = useCallback((nextQuery: PaymentQuery) => {
    const params = new URLSearchParams({
      tenantId: nextQuery.tenantId.trim(),
      orderId: nextQuery.orderId.trim(),
    })
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  const loadOrder = useCallback(
    async (nextQuery: PaymentQuery, auth: string, options?: { silent?: boolean }) => {
      requestController.current?.abort()
      const controller = new AbortController()
      requestController.current = controller
      if (!options?.silent) {
        setIsLoading(true)
        setError('')
        setNotice('')
        setPaymentAction(null)
      }
      try {
        const result = await getOrder(nextQuery, auth, controller.signal)
        setOrder(result)
        setSelectedMethod((current) => current && result.availablePaymentMethods.includes(current)
          ? current : (result.availablePaymentMethods[0] ?? null))
        return result
      } catch (requestError) {
        if (!options?.silent) {
          setOrder(null)
          setError(getErrorMessage(requestError))
        }
        throw requestError
      } finally {
        if (!options?.silent) setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => () => requestController.current?.abort(), [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoQuery') !== '1' || params.get('paymentReturn') === 'alipay'
      || !authorizationIsValid || !queryIsComplete) return
    saveTenantId(query.tenantId)
    void loadOrder(query, authorization.trim()).catch(() => undefined)
  }, [authorization, authorizationIsValid, loadOrder, query, queryIsComplete])

  useEffect(() => {
    if (!paymentAction || paymentAction.actionType !== BillingPaymentActionType.QrCode) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [paymentAction])

  useEffect(() => {
    if (!isPaymentDialogOpen) return
    paymentDialogRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPaymentDialogOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPaymentDialogOpen])

  const handleQuery = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedAuthorization = authorization.trim()
    const normalizedQuery = { ...query, tenantId: query.tenantId.trim(), orderId: query.orderId.trim() }
    if (!authorizationIsValid) {
      setError('Authorization 格式应为 md_pss_id {sessionId}。')
      return
    }
    if (!queryIsComplete) {
      setError('请填写 Tenant ID 和 Billing Order ID。')
      return
    }
    sessionStorage.setItem(AUTHORIZATION_STORAGE_KEY, normalizedAuthorization)
    saveTenantId(normalizedQuery.tenantId)
    syncUrl(normalizedQuery)
    await loadOrder(normalizedQuery, normalizedAuthorization).catch(() => undefined)
  }

  const handleClearAuthorization = () => {
    sessionStorage.removeItem(AUTHORIZATION_STORAGE_KEY)
    setAuthorization('')
    setOrder(null)
    setPaymentAction(null)
    setIsPaymentDialogOpen(false)
    setError('')
  }

  const handleCreatePayment = async () => {
    if (!order || !selectedMethod || isPaying) return
    if (selectedMethod === BillingPaymentMethod.CreditPoint
      && !window.confirm(`确认使用信用点支付 ${formatAmount(order.amount)}？`)) return

    let alipayWindow: Window | null = null
    if (selectedMethod === BillingPaymentMethod.Alipay) {
      alipayWindow = window.open('', '_blank')
      if (alipayWindow) alipayWindow.opener = null
    }

    setIsPaying(true)
    setError('')
    setNotice('')
    setDialogNotice('')
    const controller = new AbortController()
    requestController.current?.abort()
    requestController.current = controller
    try {
      const result = await createPayment({
        tenantId: query.tenantId.trim(),
        orderId: query.orderId.trim(),
        paymentMethod: selectedMethod,
        returnUrl: selectedMethod === BillingPaymentMethod.Alipay
          ? getAlipayReturnUrl() : window.location.href,
      }, authorization.trim(), controller.signal)
      setPaymentAction(result)

      if (result.actionType === BillingPaymentActionType.RedirectUrl) {
        const target = getSafeRedirectUrl(result.actionContent)
        if (!target) throw new Error('支付渠道返回了无效的跳转地址。')
        setIsPaymentDialogOpen(true)
        setDialogNotice(alipayWindow
          ? '支付宝支付页已在新标签页打开。'
          : '浏览器阻止了新标签页，请点击下方按钮打开支付宝支付页。')
        if (alipayWindow) alipayWindow.location.href = target
        return
      }
      alipayWindow?.close()
      if (result.actionType === BillingPaymentActionType.QrCode) {
        setNow(Date.now())
        setIsPaymentDialogOpen(true)
        setDialogNotice('请使用微信扫码完成支付。')
        return
      }
      const latest = await loadOrder(query, authorization, { silent: true })
      setNotice(latest.orderStatus === BillingOrderStatus.Completed
        ? '信用点支付成功，订单已完成。' : '信用点支付成功，正在同步订单状态。')
    } catch (paymentError) {
      alipayWindow?.close()
      setError(getErrorMessage(paymentError))
    } finally {
      setIsPaying(false)
    }
  }

  const handleCheckPayment = async () => {
    if (isCheckingPayment) return
    setIsCheckingPayment(true)
    setDialogNotice('')
    try {
      const latest = await loadOrder(query, authorization, { silent: true })
      if (latest.orderStatus === BillingOrderStatus.PendingPayment) {
        setDialogNotice('暂未确认到账，请完成支付后再查询。')
        return
      }
      if (terminalStatuses.has(latest.orderStatus)) {
        setNotice(`支付结果已同步：${getEnumLabel(orderStatusLabels, latest.orderStatus)}。`)
      } else {
        setDialogNotice(`订单当前状态为“${getEnumLabel(orderStatusLabels, latest.orderStatus)}”，请稍后再查询。`)
        return
      }
      setPaymentAction(null)
      setIsPaymentDialogOpen(false)
    } catch (paymentError) {
      const message = getErrorMessage(paymentError)
      if (message) setDialogNotice(message)
    } finally {
      setIsCheckingPayment(false)
    }
  }

  const remainingSeconds = paymentAction?.expiresAt
    ? Math.max(0, Math.ceil((paymentAction.expiresAt - now) / 1000)) : 0
  const canPay = Boolean(order?.orderStatus === BillingOrderStatus.PendingPayment
    && selectedMethod && !isPaying)
  const apiStatus = isLoading ? '连接中' : order ? '已连接' : error ? '连接异常' : '等待查询'
  const apiStatusTone = isLoading ? 'checking' : order ? 'connected' : error ? 'failed' : 'idle'
  const visibleMethods = useMemo(
    () => order?.availablePaymentMethods.filter((method) => paymentMethods[method]) ?? [], [order],
  )
  const paymentRedirectUrl = paymentAction?.actionType === BillingPaymentActionType.RedirectUrl
    ? getSafeRedirectUrl(paymentAction.actionContent) : null

  if (new URLSearchParams(window.location.search).get('paymentReturn') === 'alipay') {
    return <PaymentReturnPage />
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><p className="product-name">MD Billing</p><h1>支付流程测试台</h1></div>
        <div className="topbar-actions">
          <a className="records-link" href="/">创建订单</a>
          <a className="records-link" href="/records">查看账务记录</a>
          <a className="records-link" href="/statistics">信用点统计</a>
          <div className={`api-status ${apiStatusTone}`} role="status">
            <span className="status-dot" aria-hidden="true" />API {apiStatus}
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="configuration" aria-labelledby="configuration-title">
          <div className="section-heading">
            <div><h2 id="configuration-title">请求配置</h2><p>认证信息只保留在当前标签页</p></div>
            {authorization && <button className="text-button danger" type="button"
              onClick={handleClearAuthorization}>清除认证</button>}
          </div>

          <form onSubmit={handleQuery} noValidate>
            <div className="field-group">
              <label htmlFor="authorization">Authorization</label>
              <div className="secret-field">
                <input id="authorization" type={showAuthorization ? 'text' : 'password'}
                  value={authorization} onChange={(event) => {
                    setAuthorization(event.target.value)
                    clearLoadedOrder()
                  }}
                  placeholder="md_pss_id 09f0410b..." autoComplete="off" spellCheck={false} />
                <button type="button" className="secret-toggle"
                  onClick={() => setShowAuthorization((current) => !current)}
                  aria-label={showAuthorization ? '隐藏 Authorization' : '显示 Authorization'}>
                  {showAuthorization ? '隐藏' : '显示'}
                </button>
              </div>
              <p className="field-help">填写完整 Header 值，不会写入页面 URL。</p>
            </div>

            <div className="field-group">
              <label htmlFor="tenantId">Tenant ID</label>
              <input id="tenantId" value={query.tenantId}
                onChange={(event) => {
                  saveTenantId(event.target.value)
                  updateQuery({ tenantId: event.target.value })
                }}
                placeholder="输入订单所属 Tenant ID" autoComplete="off" />
            </div>
            <div className="field-group">
              <label htmlFor="orderId">Billing Order ID</label>
              <input id="orderId" value={query.orderId}
                onChange={(event) => updateQuery({ orderId: event.target.value })}
                placeholder="输入账务订单 ID" autoComplete="off" />
            </div>
            <button className="secondary-action" type="submit" disabled={isLoading}>
              {isLoading ? '正在查询…' : '查询订单'}
            </button>
          </form>
        </aside>

        <main className="checkout" id="main-content">
          {error && <div className="message error-message" role="alert"><span aria-hidden="true">!</span>
            <div><strong>请求未完成</strong><p>{error}</p></div></div>}
          {notice && !error && <div className="message notice-message" role="status">
            <span aria-hidden="true">✓</span><p>{notice}</p></div>}

          {isLoading ? <LoadingState /> : order ? <>
            <section className="order-summary" aria-labelledby="order-title">
              <div className="section-heading summary-heading">
                <div><p className="section-context">订单详情</p><h2 id="order-title">{order.productName}</h2></div>
                <span className={`order-status status-${order.orderStatus}`}>
                  {getEnumLabel(orderStatusLabels, order.orderStatus)}</span>
              </div>
              <dl className="order-facts">
                <div><dt>订单号</dt><dd>{order.orderNo}</dd></div>
                <div><dt>订单 ID</dt><dd>{order.orderId}</dd></div>
                <div><dt>商品编码</dt><dd>{order.productCode}</dd></div>
                <div><dt>数量</dt><dd>{order.quantity}</dd></div>
                <div><dt>创建时间</dt><dd>{formatTime(order.createdAt)}</dd></div>
              </dl>
              <div className="amount-row"><span>应付金额</span>
                <strong>{formatAmount(order.amount)}</strong></div>
            </section>

            <section className="payment-section" aria-labelledby="payment-title">
                <div className="section-heading"><div><p className="section-context">下一步</p>
                  <h2 id="payment-title">选择支付方式</h2></div>
                  <span className="method-count">{visibleMethods.length} 种可用方式</span></div>

                {order.orderStatus !== BillingOrderStatus.PendingPayment
                  ? <div className="finished-state"><strong>{getEnumLabel(orderStatusLabels, order.orderStatus)}</strong>
                    <p>当前订单不需要继续创建支付。</p></div>
                  : visibleMethods.length > 0
                    ? <div className="payment-methods" role="radiogroup" aria-label="支付方式">
                      {visibleMethods.map((method) => {
                        const meta = paymentMethods[method]
                        return <label className={`payment-method ${selectedMethod === method ? 'selected' : ''}`}
                          key={method}><input type="radio" name="paymentMethod" value={method}
                            checked={selectedMethod === method} onChange={() => setSelectedMethod(method)} />
                          <span className={`method-mark ${meta.tone}`} aria-hidden="true">{meta.mark}</span>
                          <span className="method-copy"><strong>{meta.name}</strong>
                            <small>{meta.description}</small></span>
                          <span className="radio-indicator" aria-hidden="true" /></label>
                      })}</div>
                    : <div className="finished-state"><strong>暂无可用支付方式</strong>
                      <p>当前商品策略没有返回可供前端选择的支付渠道。</p></div>}

                <div className="payment-footer"><p>每次创建支付都会生成新的渠道支付单。</p>
                  <button className="primary-action" type="button" disabled={!canPay}
                    onClick={handleCreatePayment}>{isPaying
                      ? '正在创建支付…' : paymentAction ? '重新创建支付' : '创建支付'}</button></div>
              </section>
          </> : <EmptyState />}
        </main>
      </div>
      {isPaymentDialogOpen && paymentAction && (
        <div className="dialog-backdrop">
          <div className="payment-dialog" ref={paymentDialogRef} role="dialog" aria-modal="true"
            aria-labelledby="payment-dialog-title" tabIndex={-1}>
            <button className="dialog-close" type="button" aria-label="关闭支付窗口"
              onClick={() => setIsPaymentDialogOpen(false)}>×</button>
            <div className="dialog-heading">
              <span className={`method-mark ${
                paymentAction.actionType === BillingPaymentActionType.QrCode ? 'wechat' : 'alipay'
              }`} aria-hidden="true">
                {paymentAction.actionType === BillingPaymentActionType.QrCode ? '微' : '支'}
              </span>
              <div>
                <p className="section-context">
                  {paymentAction.actionType === BillingPaymentActionType.QrCode ? '微信支付' : '支付宝'}
                </p>
                <h2 id="payment-dialog-title">
                  {paymentAction.actionType === BillingPaymentActionType.QrCode
                    ? '请使用微信扫码' : '请在新页面完成支付'}
                </h2>
              </div>
            </div>

            {paymentAction.actionType === BillingPaymentActionType.QrCode
              && paymentAction.actionContent && (
              <div className="dialog-qr">
                <div className="qr-code" aria-label="微信支付二维码">
                  <QRCodeSVG value={paymentAction.actionContent} size={208} level="M" marginSize={2} />
                </div>
                <div className={`countdown ${remainingSeconds === 0 ? 'expired' : ''}`}>
                  {remainingSeconds > 0
                    ? `二维码剩余 ${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${
                      (remainingSeconds % 60).toString().padStart(2, '0')}`
                    : '二维码已失效，请重新创建支付'}
                </div>
              </div>
            )}

            {dialogNotice && <p className="dialog-notice" role="status">{dialogNotice}</p>}
            <p className="dialog-help">支付结果以渠道回调和后端订单状态为准。</p>

            <div className="dialog-actions">
              <button className="primary-action" type="button" onClick={handleCheckPayment}
                disabled={isCheckingPayment}>
                {isCheckingPayment ? '正在查询…' : '我已完成支付，查询结果'}
              </button>
              {paymentAction.actionType === BillingPaymentActionType.RedirectUrl && paymentRedirectUrl
                ? <a className="secondary-link" href={paymentRedirectUrl} target="_blank"
                  rel="noopener noreferrer">重新打开支付页</a>
                : <button className="secondary-action compact" type="button"
                  onClick={handleCreatePayment} disabled={isPaying}>
                  {isPaying ? '正在创建…' : '重新创建二维码'}
                </button>}
              <button className="text-button" type="button"
                onClick={() => setIsPaymentDialogOpen(false)}>暂不支付</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentReturnPage() {
  return <main className="payment-return">
    <div className="return-mark" aria-hidden="true">✓</div>
    <p className="section-context">支付宝支付</p>
    <h1>支付操作已结束</h1>
    <p>请返回原来的支付测试页面，点击“我已完成支付，查询结果”确认订单状态。</p>
    <button className="primary-action" type="button" onClick={() => window.close()}>关闭此页面</button>
  </main>
}

function LoadingState() {
  return <div className="loading-state" aria-label="正在加载订单" role="status">
    <div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" />
    <div className="skeleton skeleton-line short" /><div className="skeleton skeleton-amount" />
    <span className="sr-only">正在加载订单</span></div>
}

function EmptyState() {
  return <section className="empty-state"><div className="empty-symbol" aria-hidden="true">¥</div>
    <h2>先连接一笔账务订单</h2>
    <p>在左侧填写 Authorization、Tenant ID 和已有订单 ID，即可开始验证完整支付流程。</p>
    <ol><li>输入请求身份和订单定位信息</li><li>查询订单快照及可用支付方式</li>
      <li>创建支付并等待渠道回调</li></ol></section>
}

export default App
