import { FormEvent, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import ModalWrapper from "./base/modal-wrapper";
import Modal from "./base/modal";
import Input from "./base/input";
import Button from "./base/button";
import { VocechatServer } from "@/types/common";
import { updateServerCredentials } from "@/app/slices/data";

type Props = {
  server: VocechatServer;
  onClose: () => void;
};

const ModalServerCredentials = ({ server, onClose }: Props) => {
  const dispatch = useDispatch();
  const [username, setUsername] = useState(server.credentials?.username ?? "");
  const [password, setPassword] = useState(server.credentials?.password ?? "");
  const [submitted, setSubmitted] = useState(false);

  const isValid = useMemo(() => username.trim().length > 0 && password.trim().length > 0, [username, password]);
  const formId = useMemo(() => "vocechat-credentials-form", []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    dispatch(
      updateServerCredentials({
        web_url: server.web_url,
        credentials: { username: username.trim(), password }
      })
    );
    onClose();
  };

  const handleClear = () => {
    dispatch(updateServerCredentials({ web_url: server.web_url }));
    onClose();
  };

  return (
    <ModalWrapper>
      <Modal
        title="Remember Credentials"
        description={`Store credentials for ${server.name}. They are saved locally on this device.`}
        buttons={
          <>
            {server.credentials && (
              <Button mode="ghost" onClick={handleClear} type="button">
                Clear Saved Credentials
              </Button>
            )}
            <Button type="submit" form={formId} disabled={!isValid}>
              Save
            </Button>
          </>
        }
      >
        <form id={formId} className="flex w-full flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-900 dark:text-gray-100" htmlFor="vocechat-username">
              Username
            </label>
            <Input
              id="vocechat-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
              className={submitted && username.trim().length === 0 ? "error" : ""}
            />
            {submitted && username.trim().length === 0 && (
              <span className="text-xs text-red-500">Username is required.</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-900 dark:text-gray-100" htmlFor="vocechat-password">
              Password
            </label>
            <Input
              id="vocechat-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              className={submitted && password.trim().length === 0 ? "error" : ""}
            />
            {submitted && password.trim().length === 0 && (
              <span className="text-xs text-red-500">Password is required.</span>
            )}
          </div>
        </form>
      </Modal>
    </ModalWrapper>
  );
};

export default ModalServerCredentials;
