import browser from "webextension-polyfill"
import {
  EXTERNAL_PORT_NAME,
  PortRequestEvent,
  PortResponseEvent,
  ProviderRPCError,
  RPCRequest,
} from "@tallyho/provider-bridge-shared"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from ".."
import logger from "../../lib/logger"
import BaseService from "../base"
import InternalEthereumProviderService from "../internal-ethereum-provider"
import { getOrCreateDB, ProviderBridgeServiceDatabase } from "./db"
import { PermissionRequest } from "../../redux-slices/provider-bridge"

type Events = ServiceLifecycleEvents & {
  permissionRequest: PermissionRequest
}

/**
 * The ProviderBridgeService is responsible for the communication with the
 * provider-bridge (content-script).
 *
 * The main purpose for this service/layer is to provide a transition
 * between the untrusted communication from the window-provider - which runs
 * in shared dapp space and can be modified by other extensions - and our
 * internal service layer.
 *
 * The reponsibility of this service is 2 fold.
 * - Provide connection interface - handle port communication, connect, disconnect etc
 * - Validate the incoming communication and make sure that what we receive is what we expect
 */
export default class ProviderBridgeService extends BaseService<Events> {
  allowedPages: {
    [url: string]: PermissionRequest
  } = {}

  #pendingPermissionsRequests: {
    [url: string]: (value: unknown) => void
  } = {}

  static create: ServiceCreatorFunction<
    Events,
    ProviderBridgeService,
    [Promise<InternalEthereumProviderService>]
  > = async (internalEthereumProviderService) => {
    return new this(
      await getOrCreateDB(),
      await internalEthereumProviderService
    )
  }

  private constructor(
    private db: ProviderBridgeServiceDatabase,
    private internalEthereumProviderService: InternalEthereumProviderService
  ) {
    super()

    browser.runtime.onConnect.addListener(async (port) => {
      if (port.name === EXTERNAL_PORT_NAME && port.sender?.url) {
        const listener = this.onMessageListener(
          port as Required<browser.Runtime.Port>
        )
        port.onMessage.addListener(listener)
        // TODO: store port with listener to handle cleanup
      }
    })

    // TODO: on internal provider handlers connect, disconnect, account change, network change
  }

  onMessageListener(
    port: Required<browser.Runtime.Port>
  ): (event: PortRequestEvent) => Promise<void> {
    const url = port.sender.url as string
    const favIconUrl = port.sender.tab?.favIconUrl ?? ""

    return async (event: PortRequestEvent) => {
      // a port: browser.Runtime.Port is passed into this function as a 2nd argument by the port.onMessage.addEventListener.
      // This contradicts the MDN documentation so better not to rely on it.
      /*logger.log(
        `background: request payload: ${JSON.stringify(event.request)}`
      )*/

      if (
        event.request.method === "eth_requestAccounts" &&
        !(await this.permissionCheck(url))
      ) {
        const permissionRequest: PermissionRequest = {
          url,
          favIconUrl,
          state: "request",
        }

        const blockUntilUserAction = await this.permissionRequest(
          permissionRequest
        )
        await blockUntilUserAction
      }

      // TBD @Antonio:
      // I copied the way MM works here — I return `result: []` when the url does not have permission
      // According to EIP-1193 it should return a `4100` ProviderRPCError but felt that dApps probably does not expect this.
      const response: PortResponseEvent = { id: event.id, result: [] }
      if (await this.permissionCheck(url)) {
        if (event.request.method === "eth_sendTransaction") {
          logger.error("Showin")
          await ProviderBridgeService.showDappConnectWindow("/signTransaction")
        }

        console.log("awaiting", event.request.method)
        response.result = await this.routeContentScriptRPCRequest(
          event.request.method,
          event.request.params
        )
      }
      console.log("background response:", event.request.method, response)

      port.postMessage(response)
    }
  }

  async permissionRequest(permissionRequest: PermissionRequest) {
    let blockResolve: (value: unknown) => void | undefined
    const blockUntilUserAction = new Promise((resolve) => {
      blockResolve = resolve
    })

    this.emitter.emit("permissionRequest", permissionRequest)
    await ProviderBridgeService.showDappConnectWindow("/permission")

    // ts compiler does not know that we assign value to blockResolve so we need to tell him
    this.#pendingPermissionsRequests[permissionRequest.url] = blockResolve!
    return blockUntilUserAction
  }

  async permissionGrant(permission: PermissionRequest): Promise<void> {
    if (this.#pendingPermissionsRequests[permission.url]) {
      this.allowedPages[permission.url] = permission
      this.#pendingPermissionsRequests[permission.url]("Time to move on")
      delete this.#pendingPermissionsRequests[permission.url]
    }
  }

  async permissionDenyOrRevoke(permission: PermissionRequest): Promise<void> {
    if (this.#pendingPermissionsRequests[permission.url]) {
      delete this.allowedPages[permission.url]
      this.#pendingPermissionsRequests[permission.url]("Time to move on")
      delete this.#pendingPermissionsRequests[permission.url]
    }
  }

  async permissionCheck(url: string): Promise<boolean> {
    if (this.allowedPages[url]?.state === "allow") return Promise.resolve(true)
    return Promise.resolve(false)
  }

  async routeContentScriptRPCRequest(
    method: string,
    params: RPCRequest["params"]
  ): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
        return this.internalEthereumProviderService.routeSafeRPCRequest(
          "eth_accounts",
          params
        )
      default: {
        return this.internalEthereumProviderService.routeSafeRPCRequest(
          method,
          params
        )
      }
    }
  }

  static async showDappConnectWindow(
    url: string
  ): Promise<browser.Windows.Window> {
    const { left = 0, top, width = 1920 } = await browser.windows.getCurrent()
    const popupWidth = 400
    const popupHeight = 600
    return browser.windows.create({
      url: `${browser.runtime.getURL("popup.html")}?page=${url}`,
      type: "popup",
      left: left + width - popupWidth,
      top,
      width: popupWidth,
      height: popupHeight,
      focused: true,
    })
  }
}
