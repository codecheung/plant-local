// ⚠️ 必须在最顶部导入，在任何 Semi 组件之前（见 https://semi.design ）
import '@douyinfe/semi-ui/react19-adapter';
import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Dropdown,
  Input,
  Nav,
  Space,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconAIBellLevel2,
  IconAIFileLevel2,
  IconAIStrokedLevel2,
  IconMoon,
  IconSun,
} from '@douyinfe/semi-icons';
import { PlantConsole } from '@/features/plant-console/PlantConsole';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './App.css';

const { Title, Text } = Typography;

const AUTH_KEY = 'plant_local_logged_in';
const THEME_KEY = 'plant_local_theme_mode';
const AUTH_USER = 'admin';
const AUTH_PASS = '123456';

function AppShell({
  onLogout,
  themeMode,
  onToggleTheme,
}: {
  onLogout: () => void;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const current = location.pathname.startsWith('/train-infer')
    ? 'train-infer'
    : location.pathname.startsWith('/models')
      ? 'models'
      : 'data-label';

  return (
    <div className="app-nav-wrap">
      <Nav
        mode="horizontal"
        selectedKeys={[current]}
        items={[
          {
            itemKey: 'data-label',
            text: '数据与标注',
            icon: <IconAIStrokedLevel2 />,
          },
          {
            itemKey: 'train-infer',
            text: '训练与识别',
            icon: <IconAIBellLevel2 />,
          },
          { itemKey: 'models', text: '模型版本', icon: <IconAIFileLevel2 /> },
        ]}
        onSelect={(data) => navigate(`/${String(data.itemKey)}`)}
        header={{
          text: '植物识别本地训练控制台',
        }}
        footer={
          <Space spacing={12}>
            <Button
              theme="borderless"
              onClick={onToggleTheme}
              style={{
                color: 'var(--semi-color-text-2)',
                width: 32,
                height: 32,
                minWidth: 32,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {themeMode === 'dark' ? (
                <IconSun
                  style={{ fontSize: 26, color: 'var(--semi-color-text-2)' }}
                />
              ) : (
                <IconMoon
                  style={{ fontSize: 26, color: 'var(--semi-color-text-2)' }}
                />
              )}
            </Button>
            <Dropdown
              className="app-user-dropdown"
              position="bottomRight"
              render={
                <Dropdown.Menu>
                  <Dropdown.Item onClick={onLogout}>退出登录</Dropdown.Item>
                </Dropdown.Menu>
              }
            >
              <Avatar size="small" color="purple" style={{ margin: 6 }}>
                AD
              </Avatar>
              <span className="app-user-name">admin</span>
            </Dropdown>
          </Space>
        }
      />
      <Routes>
        <Route path="/" element={<Navigate to="/data-label" replace />} />
        <Route
          path="/data-label"
          element={<PlantConsole page="data-label" />}
        />
        <Route
          path="/train-infer"
          element={<PlantConsole page="train-infer" />}
        />
        <Route path="/models" element={<PlantConsole page="models" />} />
        <Route path="*" element={<Navigate to="/data-label" replace />} />
      </Routes>
    </div>
  );
}

const App = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [loggedIn, setLoggedIn] = useState(
    () => window.localStorage.getItem(AUTH_KEY) === '1',
  );

  useEffect(() => {
    const body = document.body;
    if (themeMode === 'dark') {
      body.setAttribute('theme-mode', 'dark');
    } else {
      body.removeAttribute('theme-mode');
    }
    window.localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);

  const onLogin = () => {
    const u = username.trim();
    if (u === AUTH_USER && password === AUTH_PASS) {
      window.history.replaceState(null, '', '/data-label');
      setLoggedIn(true);
      setError('');
      window.localStorage.setItem(AUTH_KEY, '1');
      return;
    }
    setError('账号或密码错误，请重试。');
  };

  const onLogout = () => {
    setLoggedIn(false);
    setPassword('');
    setError('');
    window.localStorage.removeItem(AUTH_KEY);
  };

  const onToggleTheme = () => {
    setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  if (!loggedIn) {
    return (
      <div className="auth-page">
        <Card
          title="登录"
          bordered
          className="auth-card"
          style={{ width: 380 }}
          bodyStyle={{ paddingTop: 18 }}
        >
          <Space vertical align="start" style={{ width: '100%' }}>
            <Title heading={6} style={{ margin: 0 }}>
              植物识别本地训练控制台
            </Title>
            <Input
              placeholder="账号"
              value={username}
              onChange={setUsername}
              style={{ width: '100%' }}
            />
            <Input
              mode="password"
              placeholder="密码"
              value={password}
              onChange={setPassword}
              style={{ width: '100%' }}
              onEnterPress={onLogin}
            />
            {error ? <Text type="danger">{error}</Text> : null}
            <Button type="primary" onClick={onLogin}>
              登录
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppShell
        onLogout={onLogout}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
      />
    </BrowserRouter>
  );
};

export default App;
