/** 业务异常：带 HTTP 状态码与业务错误码，统一由全局错误处理器输出 */
export class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const Errors = {
  badRequest: (message = '请求参数不合法', details) => new ApiError(400, 40001, message, details),
  unauthorized: (message = '未登录或登录已过期') => new ApiError(401, 40101, message),
  forbidden: (message = '当前角色无权执行该操作') => new ApiError(403, 40301, message),
  notFound: (message = '资源不存在') => new ApiError(404, 40401, message),
  conflict: (message = '资源状态冲突') => new ApiError(409, 40901, message),
  tooMany: (message = '请求过于频繁') => new ApiError(429, 42901, message),
  internal: (message = '服务内部错误') => new ApiError(500, 50001, message),
  unavailable: (message = '依赖服务不可用') => new ApiError(503, 50301, message),
}

/** 业务错误码说明，随 /meta 一并下发，便于前端统一提示 */
export const ERROR_CODES = {
  40001: '请求参数不合法（字段校验失败）',
  40101: '未登录或令牌失效',
  40301: '角色权限不足',
  40401: '资源不存在',
  40901: '资源状态冲突（如重复编号、状态机非法流转）',
  42901: '请求过于频繁',
  50001: '服务内部错误',
  50301: '数据库或依赖服务不可用',
}

export function isApiError(error) {
  return error instanceof ApiError
}

export default ApiError
