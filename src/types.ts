export const BillingOrderStatus = {
  Unspecified: 0, PendingPayment: 1, Paid: 2, Completed: 3, Expired: 4,
} as const
export type BillingOrderStatus = (typeof BillingOrderStatus)[keyof typeof BillingOrderStatus]

export const BillingPaymentMethod = { Alipay: 1, WechatPay: 2, CreditPoint: 3 } as const
export type BillingPaymentMethod = (typeof BillingPaymentMethod)[keyof typeof BillingPaymentMethod]

export const BillingPaymentActionType = { Unspecified: 0, RedirectUrl: 1, QrCode: 2, None: 3 } as const
export type BillingPaymentActionType = (typeof BillingPaymentActionType)[keyof typeof BillingPaymentActionType]
export interface ApiResult<T> { code: number; message?: string; data?: T }
export interface PaymentQuery { tenantId: string; orderId: string }
export interface GetPaymentOrderResponse {
  orderId: string; orderNo: string; productCode: number; productName: string; quantity: number;
  amount: number; orderStatus: BillingOrderStatus; paymentId?: string;
  paymentMethod?: BillingPaymentMethod; creditPointEntryId?: string;
  availablePaymentMethods: BillingPaymentMethod[]; createdAt: number;
}
export interface CreatePaymentRequest extends PaymentQuery { paymentMethod: BillingPaymentMethod; returnUrl: string }
export interface CreatePaymentResponse {
  orderId: string; orderStatus: BillingOrderStatus; item: OrderItem;
  paymentId?: string; creditPointEntryId?: string;
  paymentStatus: number; actionType: BillingPaymentActionType; actionContent?: string; expiresAt: number;
}

export const ProductSource = { Unspecified: 0, Hap: 1, Hdp: 2 } as const
export type ProductSource = (typeof ProductSource)[keyof typeof ProductSource]

export interface PageRequest { pageIndex: number; pageSize: number }
export interface PageResult { totalCount: number; pageIndex: number; pageSize: number }
export interface OrderItem {
  productCode: number; productName: string; quantity: number; unitPrice: number;
}
export interface BillingOrder {
  orderId: string; orderNo: string; productSource: ProductSource; tenantId: string; item: OrderItem;
  totalAmount: number; orderStatus: number; paymentId?: string;
  creatorAccountId?: string; payerAccountId?: string; createTime?: string; createdAt?: number; paidAt: number;
  completedAt: number; failureReason?: string; businessContext?: Record<string, string>;
  paymentMethod: number; creditPointEntryId?: string;
}
export interface ListOrdersRequest {
  requestId: string; productSource: ProductSource; tenantId: string; orderStatuses: number[];
  productCode: number; orderNo: string; creatorAccountId: string; createdFrom: string;
  createdTo: string; page: PageRequest;
}
export interface ListOrdersData { items: BillingOrder[]; page: PageResult }
export interface CreateOrderRequest {
  requestId: string; productSource: ProductSource; tenantId: string; productCode: number;
  quantity: number; totalAmount: number; businessContext: Record<string, string>;
}

export interface GetCreditPointBalanceRequest {
  productSource: ProductSource; tenantId: string;
}
export interface CreditPointBalance {
  productSource: ProductSource; tenantId: string; balance: number;
  createTime?: string; updateTime?: string; createdAt?: number; updatedAt?: number;
}
export const CreditPointTransactionType = {
  Unspecified: 0, Income: 1, Expense: 2, Refund: 3,
} as const
export type CreditPointTransactionType =
  (typeof CreditPointTransactionType)[keyof typeof CreditPointTransactionType]
export const CreditPointBusinessType = {
  Unspecified: 0,
  Sms: 1,
  Recharge: 2,
  Upgrade: 3,
  MemberPackage: 4,
  AppBill: 5,
  AppBillAutoPay: 6,
  AppReturnMoney: 7,
  DayPackage: 8,
  OaPackage: 9,
  UpgradeEnterpriseAndOa: 10,
  ApprovePackage: 11,
  EnterpriseAndApprove: 12,
  Enterprise: 13,
  Ultimate: 14,
  Email: 15,
  ApkPackage: 16,
  WorkflowPackage: 17,
  MonthlyWorkflowPackage: 18,
  ApkStoragePackage: 19,
  Ocr: 20,
  ExternalUserPackage: 21,
  DataPipelinePackage: 22,
  MonthlyDataPipelinePackage: 23,
  ApiIntegration: 24,
  ComputingInstance: 25,
  MonthlyComputingInstance: 26,
  FileConvertToPdf: 27,
  AggregationTable: 28,
  Aigc: 29,
  DocumentParse: 30,
  AiAgent: 31,
  AiAction: 32,
  Embedding: 33,
  VectorKnowledgeChunk: 34,
  MingdaoOpt: 35,
  MdCloud: 36,
  MingoAgent: 37,
  ProductFunction: 100,
  BillingOrder: 101,
} as const
export type CreditPointBusinessType =
  (typeof CreditPointBusinessType)[keyof typeof CreditPointBusinessType]
export interface CreditPointEntry {
  id: string; transactionType: CreditPointTransactionType; amount: number; balanceBefore: number; balanceAfter: number;
  quantity: number; orderId?: string; originalEntryId?: string; businessType: CreditPointBusinessType;
  operatorAccountId?: string; remark?: string; createTime?: string; createdAt?: number;
  extensionData?: Record<string, string>;
}
export interface GetListCreditPointsRequest {
  requestId: string; productSource: ProductSource; tenantId: string; transactionType: CreditPointTransactionType;
  businessTypes: CreditPointBusinessType[]; operatorAccountId: string; createdFrom: string; createdTo: string;
  extensionFilters: Record<string, string>; page: PageRequest;
}
export interface GetListCreditPointsData { items: CreditPointEntry[]; page: PageResult }

export const CreditPointStatisticGranularity = { None: 0, Day: 1 } as const
export type CreditPointStatisticGranularity =
  (typeof CreditPointStatisticGranularity)[keyof typeof CreditPointStatisticGranularity]

export interface GetCreditPointOverviewRequest {
  requestId: string; productSource: ProductSource; tenantId: string;
  createdFrom: string; createdTo: string;
}
export interface CreditPointOverview {
  periodConsumption: number; totalRecharge: number; totalConsumption: number;
}
export interface CreditPointStatisticPoint {
  bucketStart: number; amount: number; quantity: number; count: number;
}
export interface CreditPointStatisticSeries {
  businessType: CreditPointBusinessType; extensionData: Record<string, string>; totalAmount: number;
  totalQuantity: number; totalCount: number; points: CreditPointStatisticPoint[];
}
export interface ApplicationInfo {
  appId: string; appName: string; appIconColor?: string; appIconUrl?: string;
  status?: number; createType?: number; urlTemplate?: string;
}
export interface ApplicationCreditPointStatisticSeries extends CreditPointStatisticSeries {
  application?: ApplicationInfo | null;
}
export interface ApplicationCreditPointStatisticsData {
  items: ApplicationCreditPointStatisticSeries[]; page: PageResult;
}
export interface GetCreditPointStatisticsRequest {
  requestId: string; productSource: ProductSource; tenantId: string; transactionType: CreditPointTransactionType;
  businessTypes: CreditPointBusinessType[]; createdFrom: string; createdTo: string;
  extensionFilters: Record<string, string>; groupByBusinessType: boolean;
  groupByExtensionField: string; granularity: CreditPointStatisticGranularity;
  page: PageRequest;
}
export interface GetCreditPointStatisticsData {
  items: CreditPointStatisticSeries[]; page: PageResult;
}
export interface GetCreditPointStatisticsSummaryRequest {
  requestId: string; productSource: ProductSource; tenantId: string;
  createdFrom: string; createdTo: string;
}
export interface CreditPointStatisticsSummary {
  distribution: GetCreditPointStatisticsData;
  scenes: GetCreditPointStatisticsData;
  trend: GetCreditPointStatisticsData;
  models: GetCreditPointStatisticsData;
  applications: ApplicationCreditPointStatisticsData;
}
