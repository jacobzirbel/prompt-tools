function useHashRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function Toast({ msg }) {
  return <div id="toast" className={msg ? 'show' : ''}>{msg}</div>;
}

function App() {
  const route = useHashRoute();
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2000);
  }, []);

  return (
    <>
      <Header route={route} />
      <div id="main">
        {route === 'builder'  && <BuilderPage  showToast={showToast} />}
        {route === 'context'  && <ContextPage  showToast={showToast} />}
        {route === 'tools'    && <ToolsPage    showToast={showToast} />}
        {route === 'settings' && <SettingsPage showToast={showToast} />}
      </div>
      <Toast msg={toastMsg} />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
