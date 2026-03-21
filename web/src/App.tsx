// ⚠️ 必须在最顶部导入，在任何 Semi 组件之前
import '@douyinfe/semi-ui/react19-adapter';
import { Button, Toast } from '@douyinfe/semi-ui';
import './App.css';

const App = () => {
  return (
    <Button onClick={() => Toast.warning({ content: 'welcome' })}>
      Hello Semi
    </Button>
  );
};

export default App;
