import {
  WINDOW_PROVIDER_FLAG,
  WindowListener,
  WindowRequestEvent,
} from "@tallyho/provider-bridge-shared"
import TallyWindowProvider from "@tallyho/window-provider"

const windowProviderEnabled = process.env.ENABLE_WINDOW_PROVIDER === "true"
const windowProviderDefaultEnabled =
  process.env.ENABLE_WINDOW_PROVIDER_DEFAULT === "true"

if (windowProviderEnabled) {
  // The window object is considered unsafe, because other extensions could have modified them before this script is run.
  // For 100% certainty we could create an iframe here, store the references and then destoroy the iframe.
  //   something like this: https://speakerdeck.com/fransrosen/owasp-appseceu-2018-attacking-modern-web-technologies?slide=95
  window.tally = new TallyWindowProvider({
    postMessage: (data: WindowRequestEvent) =>
      window.postMessage(data, window.location.origin),
    addEventListener: (fn: WindowListener) =>
      window.addEventListener("message", fn, false),
    removeEventListener: (fn: WindowListener) =>
      window.removeEventListener("message", fn, false),
    origin: window.location.origin,
  })

  if (windowProviderDefaultEnabled) {
    window.ethereum = window.tally
    // @ts-expect-error boom
    window.metamask = window.tally
  }
}
