import { Button, Typography } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

/** 后端不可达时的全屏提示与重试。 */
export function BackendUnreachable() {
  const { healthError, retry } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <ApiOutlined className="mb-4 block text-[40px] text-gray-400" />
        <Typography.Title level={4} style={{ marginBottom: 8 }}>
          服务连接失败
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          {healthError ?? '无法连接后端服务。'}
        </Typography.Paragraph>
        <Button type="primary" onClick={retry}>
          重新连接
        </Button>
      </div>
    </div>
  );
}
