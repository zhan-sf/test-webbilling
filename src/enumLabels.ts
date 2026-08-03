import {
  BillingOrderStatus,
  BillingPaymentMethod,
  CreditPointBusinessType,
  CreditPointTransactionType,
  ProductSource,
} from './types'

export const productSourceLabels: Record<number, string> = {
  [ProductSource.Unspecified]: '未指定',
  [ProductSource.Hap]: 'HAP',
  [ProductSource.Hdp]: 'HDP',
}

export const orderStatusLabels: Record<number, string> = {
  [BillingOrderStatus.Unspecified]: '未知状态',
  [BillingOrderStatus.PendingPayment]: '待支付',
  [BillingOrderStatus.Paid]: '已支付',
  [BillingOrderStatus.Completed]: '订单已完成',
  [BillingOrderStatus.Expired]: '已过期',
}

export const paymentMethodLabels: Record<number, string> = {
  0: '未指定',
  [BillingPaymentMethod.Alipay]: '支付宝',
  [BillingPaymentMethod.WechatPay]: '微信支付',
  [BillingPaymentMethod.CreditPoint]: '信用点',
}

export const creditPointTransactionTypeLabels: Record<number, string> = {
  [CreditPointTransactionType.Unspecified]: '未指定',
  [CreditPointTransactionType.Income]: '收入',
  [CreditPointTransactionType.Expense]: '支出',
  [CreditPointTransactionType.Refund]: '退款',
}

export const creditPointBusinessTypeLabels: Record<number, string> = {
  [CreditPointBusinessType.Unspecified]: '未指定',
  [CreditPointBusinessType.Sms]: '短信',
  [CreditPointBusinessType.Recharge]: '信用点充值',
  [CreditPointBusinessType.Upgrade]: '升级到付费版本',
  [CreditPointBusinessType.MemberPackage]: '用户增补包',
  [CreditPointBusinessType.AppBill]: '应用账单手动支付',
  [CreditPointBusinessType.AppBillAutoPay]: '应用账单自动支付',
  [CreditPointBusinessType.AppReturnMoney]: '应用账单归还扣款',
  [CreditPointBusinessType.DayPackage]: '天数包',
  [CreditPointBusinessType.OaPackage]: '明道云 OA 包',
  [CreditPointBusinessType.UpgradeEnterpriseAndOa]: '企业版与 OA 组合包',
  [CreditPointBusinessType.ApprovePackage]: '审批包',
  [CreditPointBusinessType.EnterpriseAndApprove]: '企业版与审批组合包',
  [CreditPointBusinessType.Enterprise]: '专业版',
  [CreditPointBusinessType.Ultimate]: '旗舰版',
  [CreditPointBusinessType.Email]: '邮件',
  [CreditPointBusinessType.ApkPackage]: '应用增补包',
  [CreditPointBusinessType.WorkflowPackage]: '工作流执行数增补包',
  [CreditPointBusinessType.MonthlyWorkflowPackage]: '当月工作流执行数增补包',
  [CreditPointBusinessType.ApkStoragePackage]: '应用附件上传流量增补包',
  [CreditPointBusinessType.Ocr]: '文字识别',
  [CreditPointBusinessType.ExternalUserPackage]: '外部用户增补包',
  [CreditPointBusinessType.DataPipelinePackage]: '数据同步算力包',
  [CreditPointBusinessType.MonthlyDataPipelinePackage]: '当月数据同步算力包',
  [CreditPointBusinessType.ApiIntegration]: 'API 集成',
  [CreditPointBusinessType.ComputingInstance]: '专属算力组织到期时长包',
  [CreditPointBusinessType.MonthlyComputingInstance]: '专属算力单月包',
  [CreditPointBusinessType.FileConvertToPdf]: '文件转 PDF',
  [CreditPointBusinessType.AggregationTable]: '聚合表数量购买',
  [CreditPointBusinessType.Aigc]: 'AIGC',
  [CreditPointBusinessType.DocumentParse]: '文档解析',
  [CreditPointBusinessType.AiAgent]: 'AI Agent',
  [CreditPointBusinessType.AiAction]: 'AI Action',
  [CreditPointBusinessType.Embedding]: '数据向量化',
  [CreditPointBusinessType.VectorKnowledgeChunk]: '向量知识库分块增补包',
  [CreditPointBusinessType.MingdaoOpt]: '系统扣除',
  [CreditPointBusinessType.MdCloud]: 'MDCloud 云服务',
  [CreditPointBusinessType.MingoAgent]: 'Mingo Agent',
  [CreditPointBusinessType.ProductFunction]: '产品功能',
  [CreditPointBusinessType.BillingOrder]: '账务中心商品订单',
}

export function getEnumLabel(labels: Record<number, string>, value: number) {
  return labels[value] ?? `未知（${value}）`
}
