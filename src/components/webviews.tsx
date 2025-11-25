import { updateNewMsgMap } from "@/app/slices/data";
import { VocechatServer } from "@/types/common";
import clsx from "clsx";
import { ipcRenderer, WebviewTag } from "electron";
import { MutableRefObject, useEffect, useRef } from "react";
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
  const { web_url } = server;

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
    };

    const handleDidFailLoad = () => {
      if (isActive) {
        console.log("load fail reloading false", webview.src);
        setReloading(false);
      }
    };

    const handleDomReady = () => {
      console.log(`${web_url} dom-ready`);
    };

    const handleConsoleMessage = (event: Electron.ConsoleMessageEvent) => {
      const { level, message, sourceId } = event;
      if (level === 3) {
        ipcRenderer.send("vocechat-logging", { level, message, sourceId });
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
    webview.addEventListener("console-message", handleConsoleMessage as any);

    return () => {
      webview.removeEventListener("did-change-theme-color", handleThemeColorChange as any);
      webview.removeEventListener("did-finish-load", handleDidFinishLoad);
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("console-message", handleConsoleMessage as any);
    };
  }, [dispatch, isActive, requestReload, setReloading, web_url, windowFocusedRef, reloadToken]);

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
