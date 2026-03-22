// ⚠️ 必须在最顶部导入，在任何 Semi 组件之前（见 https://semi.design ）
import '@douyinfe/semi-ui/react19-adapter';
import { PlantConsole } from '@/features/plant-console/PlantConsole';
import './App.css';

const App = () => {
  return <PlantConsole />;
};

export default App;
