import { updateNewMsgMap } from "@/app/slices/data";
import { VocechatServer } from "@/types/common";
import clsx from "clsx";
import { ipcRenderer, WebviewTag } from "electron";
import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";

type WebviewListProps = {
  activeURL: string;
  servers: VocechatServer[];
  requestReload: (_url: string) => void;
  reloadTokens: Record<string, number>;
  setReloading: (_param: boolean) => void;
};

const WebviewList = ({
  servers,
  activeURL,
  requestReload,
  reloadTokens,
  setReloading
}: WebviewListProps) => {
  const windowFocusedRef = useRef(true);

  useEffect(() => {
    const handleWindowFocus = (_event: unknown, isFocused: boolean) => {
      windowFocusedRef.current = isFocused;
    };
    ipcRenderer.on("vocechat-window-focus", handleWindowFocus);
    return () => {
      ipcRenderer.removeListener("vocechat-window-focus", handleWindowFocus);
    };
  }, []);

  return servers.map((server) => {
    const reloadToken = reloadTokens[server.web_url] ?? 0;
    return (
      <WebviewItem
        key={`${server.web_url}-${reloadToken}`}
        server={server}
        isActive={activeURL === server.web_url}
        reloadToken={reloadToken}
        requestReload={requestReload}
        setReloading={setReloading}
        windowFocusedRef={windowFocusedRef}
      />
    );
  });
};

type WebviewItemProps = {
  server: VocechatServer;
  isActive: boolean;
  reloadToken: number;
  requestReload: (_url: string) => void;
  setReloading: (_param: boolean) => void;
  windowFocusedRef: MutableRefObject<boolean>;
};

const WebviewItem = ({
  server,
  isActive,
  requestReload,
  setReloading,
  reloadToken,
  windowFocusedRef
}: WebviewItemProps) => {
  const dispatch = useDispatch();
  const webviewRef = useRef<WebviewTag | null>(null);
  const hasHandledKickRef = useRef(false);
  const { web_url } = server;

  const injectCredentials = useCallback(() => {
    const credentials = server.credentials;
    if (!credentials) return;
    const webview = webviewRef.current;
    if (!webview) return;
    const { username, password } = credentials;
    const script = `
      (() => {
        const select = (selectors) => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              return element;
            }
          }
          return null;
        };
        const fill = (element, value) => {
          if (!element) return;
          element.focus();
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.blur && element.blur();
        };
        const usernameInput = select([
          'input[name="username"]',
          'input[autocomplete="username"]',
          'input[name="email"]',
          'input[type="email"]',
          'input[type="text"]'
        ]);
        const passwordInput = select([
          'input[type="password"]',
          'input[autocomplete="current-password"]'
        ]);
        if (!usernameInput || !passwordInput) {
          return false;
        }
        fill(usernameInput, ${JSON.stringify(username)});
        fill(passwordInput, ${JSON.stringify(password)});
        return true;
      })();
    `;
    webview.executeJavaScript(script).catch((error) => {
      console.error("Failed to inject saved credentials", error);
    });
  }, [server.credentials]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleThemeColorChange = (evt: Electron.DidChangeThemeColorEvent) => {
      console.log("theme color changed", evt.themeColor);
      if (evt.themeColor === "#123456") {
        requestReload(web_url);
      }
    };

    const handleDidFinishLoad = () => {
      if (isActive) {
        console.log("load finish reloading false", webview.src);
        setReloading(false);
      }
      hasHandledKickRef.current = false;
      injectCredentials();
    };

    const handleDidFailLoad = () => {
      if (isActive) {
        console.log("load fail reloading false", webview.src);
        setReloading(false);
      }
    };

    const handleDomReady = () => {
      console.log(`${web_url} dom-ready`);
      injectCredentials();
    };

    const handleDidNavigateInPage = () => {
      injectCredentials();
    };

    const handleConsoleMessage = (event: Electron.ConsoleMessageEvent) => {
      const { level, message, sourceId } = event;
      if (level === 3) {
        ipcRenderer.send("vocechat-logging", { level, message, sourceId });
      }
      const normalizedMessage = message.toLowerCase?.() ?? message;
      const isKickMessage =
        typeof normalizedMessage === "string" &&
        ((normalizedMessage.includes("kicked") && normalizedMessage.includes("other device")) ||
          message.includes("被踢"));
      if (isKickMessage) {
        if (!hasHandledKickRef.current) {
          hasHandledKickRef.current = true;
          const webview = webviewRef.current;
          const webContentsId = webview?.getWebContentsId?.();
          if (webview && typeof webContentsId === "number") {
            if (isActive) {
              setReloading(true);
            }
            void ipcRenderer
              .invoke("vocechat-webview-kicked", {
                webContentsId,
                url: web_url
              })
              .catch((error) => {
                console.error("Failed to clear kicked session", error);
                hasHandledKickRef.current = false;
              });
          } else {
            hasHandledKickRef.current = false;
          }
        }
      }
      if (level === 1 && message.includes("{{NEW_MSG}}")) {
        const shouldMarkUnread = !isActive || !windowFocusedRef.current;
        if (shouldMarkUnread) {
          dispatch(updateNewMsgMap({ server: web_url, hasNewMsg: true }));
          ipcRenderer.send("vocechat-new-msg");
        }
      }
    };

    webview.addEventListener("did-change-theme-color", handleThemeColorChange as any);
    webview.addEventListener("did-finish-load", handleDidFinishLoad);
    webview.addEventListener("did-fail-load", handleDidFailLoad);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage as any);
    webview.addEventListener("console-message", handleConsoleMessage as any);

    return () => {
      webview.removeEventListener("did-change-theme-color", handleThemeColorChange as any);
      webview.removeEventListener("did-finish-load", handleDidFinishLoad);
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-navigate-in-page", handleDidNavigateInPage as any);
      webview.removeEventListener("console-message", handleConsoleMessage as any);
    };
  }, [
    dispatch,
    injectCredentials,
    isActive,
    hasHandledKickRef,
    requestReload,
    setReloading,
    web_url,
    windowFocusedRef,
    reloadToken
  ]);

  useEffect(() => {
    if (!isActive) return;
    injectCredentials();
  }, [injectCredentials, isActive]);

  return (
    <webview
      //@ts-ignore
      //eslint-disable-next-line react/no-unknown-property
      allowpopups="true"
      //@ts-ignore
      //eslint-disable-next-line react/no-unknown-property
      disablewebsecurity="true"
      ref={webviewRef}
      className={clsx(
        "absolute left-0 top-0 h-full w-full",
        isActive ? "visible" : "invisible"
      )}
      useragent={`${navigator.userAgent} ${process.platform}`}
      data-visible={isActive}
      data-src={web_url}
      src={web_url}
    ></webview>
  );
};

export default WebviewList;
