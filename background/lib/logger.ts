// Ignore the no-console lint rule since this file is meant to funnel output to
// the console.
/* eslint-disable no-console */

enum LogLevel {
  log = "log",
  info = "info",
  warn = "warn",
  error = "error",
}

function genericLogger(level: LogLevel, input: unknown[]) {
  console[level](...input)

  const stackTrace = new Error().stack.split("\n").filter((line) => {
    // Remove empty lines from the output
    // Chrome prepends the word "Error" to the first line of the trace, but Firefox doesn't
    // Let's ignore that for consistency between browsers!
    if (line.trim() === "" || line.trim() === "Error") {
      return false
    }

    return true
  })

  // The first two lines of the stack trace will always be generated by this
  // file, so let's ignore them.
  console[level](stackTrace.slice(2))
}

const logger = {
  log(...input: unknown[]): void {
    genericLogger(LogLevel.log, input)
  },

  info(...input: unknown[]): void {
    genericLogger(LogLevel.info, input)
  },

  warn(...input: unknown[]): void {
    genericLogger(LogLevel.warn, input)
  },

  error(...input: unknown[]): void {
    genericLogger(LogLevel.error, input)
  },
}

export default logger
