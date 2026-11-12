import { ERROR_CODES } from './errors.js'

export const ERRORS_BY_CODE = Object.entries(ERROR_CODES).map(([code, message]) => ({
  code: Number(code),
  message,
}))

export default ERRORS_BY_CODE
