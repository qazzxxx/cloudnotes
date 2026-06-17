import { useState } from 'react';
import { App, Button, Card, Input, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

/** 鉴权模式下的极简登录卡片（Step 6 将进一步打磨）。 */
export function LoginCard() {
  const { login } = useAuth();
  const { message } = App.useApp();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password) {
      message.warning('请输入密码');
      return;
    }
    setLoading(true);
    try {
      await login(password);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[22px]">☁️</span>
          <Typography.Title level={3} style={{ margin: 0 }}>
            云简
          </Typography.Title>
        </div>
        <Typography.Text type="secondary">请输入访问密码</Typography.Text>
        <div className="mt-5">
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="NAS 密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onPressEnter={submit}
            autoFocus
          />
          <Button type="primary" size="large" block className="!mt-3" loading={loading} onClick={submit}>
            进入
          </Button>
        </div>
      </Card>
    </div>
  );
}
