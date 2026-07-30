import { type FormEvent, useEffect, useRef, useState } from 'react'
import { ApiError, createOrder } from './api'
import { ProductSource, type BillingOrder } from './types'
import {
  AUTHORIZATION_STORAGE_KEY,
  formatAmount,
  saveTenantId,
  TENANT_ID_STORAGE_KEY,
} from './ui'
import './CreateOrderPage.css'

const products = [
  { code: 10001, source: ProductSource.Hap, name: 'HAP 主版本授权', note: '现金支付' },
  { code: 10101, source: ProductSource.Hap, name: 'HAP 用户扩展包', note: '现金或信用点' },
  { code: 10102, source: ProductSource.Hap, name: 'HAP 应用扩展包', note: '现金或信用点' },
  { code: 10103, source: ProductSource.Hap, name: 'HAP 工作流扩展包', note: '现金或信用点' },
  { code: 10201, source: ProductSource.Hap, name: 'HAP 信用点充值', note: '现金支付' },
  { code: 20001, source: ProductSource.Hdp, name: 'HDP 主版本授权', note: '现金支付' },
  { code: 20101, source: ProductSource.Hdp, name: 'HDP 用户扩展包', note: '现金或信用点' },
  { code: 20201, source: ProductSource.Hdp, name: 'HDP 信用点充值', note: '现金支付' },
] as const

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Authorization 无效或已过期，请重新填写。'
  }
  if (error instanceof Error && error.name !== 'AbortError') return error.message
  return ''
}

interface CreateOrderPageProps {
  navigate?: (url: string) => void
}

function CreateOrderPage({ navigate = (url) => window.location.assign(url) }: CreateOrderPageProps) {
  const [authorization, setAuthorization] = useState(
    () => sessionStorage.getItem(AUTHORIZATION_STORAGE_KEY) ?? '',
  )
  const [showAuthorization, setShowAuthorization] = useState(false)
  const [tenantId, setTenantId] = useState(
    () => sessionStorage.getItem(TENANT_ID_STORAGE_KEY) ?? '',
  )
  const [amount, setAmount] = useState('')
  const [selectedCode, setSelectedCode] = useState<number>(products[0].code)
  const [createdOrder, setCreatedOrder] = useState<BillingOrder | null>(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const requestController = useRef<AbortController | null>(null)

  const selectedProduct = products.find((product) => product.code === selectedCode) ?? products[0]

  useEffect(() => () => requestController.current?.abort(), [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedAuthorization = authorization.trim()
    const normalizedTenantId = tenantId.trim()
    const totalAmount = Number(amount)
    if (!/^md_pss_id\s+\S+$/.test(normalizedAuthorization)) {
      setError('Authorization 格式应为 md_pss_id {sessionId}。')
      return
    }
    if (!normalizedTenantId) {
      setError('请填写 Tenant ID。')
      return
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setError('订单金额必须大于 0。')
      return
    }

    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    sessionStorage.setItem(AUTHORIZATION_STORAGE_KEY, normalizedAuthorization)
    saveTenantId(normalizedTenantId)
    setIsSubmitting(true)
    setCreatedOrder(null)
    setError('')
    try {
      const order = await createOrder({
        requestId: 'MDBillingPaymentWeb',
        productSource: selectedProduct.source,
        tenantId: normalizedTenantId,
        productCode: selectedProduct.code,
        quantity: 1,
        totalAmount,
        businessContext: {},
      }, normalizedAuthorization, controller.signal)
      setCreatedOrder(order)
      const params = new URLSearchParams({
        tenantId: order.tenantId,
        orderId: order.orderId,
        autoQuery: '1',
      })
      navigate(`/payment?${params.toString()}`)
    } catch (requestError) {
      if (!(requestError instanceof Error && requestError.name === 'AbortError')) {
        setError(getErrorMessage(requestError))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const clearAuthorization = () => {
    sessionStorage.removeItem(AUTHORIZATION_STORAGE_KEY)
    setAuthorization('')
    setError('')
  }

  return (
    <div className="create-shell">
      <header className="create-header">
        <div>
          <p>MD Billing</p>
          <h1>创建测试订单</h1>
        </div>
        <nav aria-label="测试台导航">
          <a href="/payment">支付测试</a>
          <a href="/records">账务记录</a>
          <a href="/statistics">信用点统计</a>
        </nav>
      </header>

      <main className="create-main">
        <section className="create-intro">
          <div>
            <span>手动下单</span>
            <h2>先选择商品，再填写这笔测试订单的金额</h2>
            <p>数量固定为 1。创建成功后会携带 Tenant ID 和订单 ID 进入现有支付页。</p>
          </div>
          <div className="create-step" aria-label="当前流程">
            <strong>1</strong><span>创建订单</span><i aria-hidden="true" />
            <strong>2</strong><span>选择支付方式</span><i aria-hidden="true" />
            <strong>3</strong><span>完成支付</span>
          </div>
        </section>

        <form className="create-form" onSubmit={handleSubmit} noValidate>
          <fieldset className="product-picker">
            <legend>选择商品</legend>
            <p>商品来源随商品自动确定，不需要单独选择。</p>
            <div className="product-options">
              {products.map((product) => (
                <label key={product.code} className={selectedCode === product.code ? 'selected' : ''}>
                  <input type="radio" name="product" value={product.code}
                    checked={selectedCode === product.code}
                    onChange={() => {
                      setSelectedCode(product.code)
                      setCreatedOrder(null)
                      setError('')
                    }} />
                  <span className="product-source">{product.source === ProductSource.Hap ? 'HAP' : 'HDP'}</span>
                  <strong>{product.name}</strong>
                  <small>{product.code} · {product.note}</small>
                  <span className="product-check" aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          <section className="order-inputs" aria-labelledby="order-inputs-title">
            <div className="input-heading">
              <div>
                <h2 id="order-inputs-title">订单信息</h2>
                <p>创建人账号由 Authorization 对应的当前身份自动写入。</p>
              </div>
              {authorization && <button type="button" onClick={clearAuthorization}>清除认证</button>}
            </div>

            <label className="create-field create-auth">
              <span>Authorization</span>
              <div>
                <input aria-label="Authorization" type={showAuthorization ? 'text' : 'password'}
                  value={authorization} onChange={(event) => {
                    setAuthorization(event.target.value)
                    setCreatedOrder(null)
                    setError('')
                  }} placeholder="md_pss_id sessionId" autoComplete="off" spellCheck={false} />
                <button type="button" onClick={() => setShowAuthorization((current) => !current)}>
                  {showAuthorization ? '隐藏' : '显示'}
                </button>
              </div>
              <small>认证信息只保存在当前标签页，不会进入 URL。</small>
            </label>

            <div className="create-field-row">
              <label className="create-field">
                <span>Tenant ID</span>
                <input aria-label="Tenant ID" value={tenantId} onChange={(event) => {
                  setTenantId(event.target.value)
                  saveTenantId(event.target.value)
                  setCreatedOrder(null)
                  setError('')
                }} placeholder="输入订单所属租户 ID" autoComplete="off" />
              </label>
              <label className="create-field amount-field">
                <span>订单金额</span>
                <div>
                  <b>¥</b>
                  <input aria-label="订单金额" type="number" min="0.01" step="0.01"
                    value={amount} onChange={(event) => {
                      setAmount(event.target.value)
                      setCreatedOrder(null)
                      setError('')
                    }} placeholder="0.01" inputMode="decimal" />
                </div>
              </label>
            </div>

            {error && <div className="create-message error" role="alert"><strong>下单失败</strong><p>{error}</p></div>}
            {createdOrder && <div className="create-message success" role="status">
              <strong>订单已创建</strong><p>{createdOrder.orderNo} · {createdOrder.orderId}</p>
            </div>}

            <div className="create-submit-row">
              <div>
                <span>{selectedProduct.name}</span>
                <strong>{amount && Number(amount) > 0 ? formatAmount(Number(amount)) : '待填写金额'}</strong>
              </div>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '正在创建…' : '创建订单并去支付'}
              </button>
            </div>
          </section>
        </form>
      </main>
    </div>
  )
}

export default CreateOrderPage
