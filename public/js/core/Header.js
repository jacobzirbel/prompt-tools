function Header({ route }) {
  const navItems = [
    { id: 'builder',  label: 'Builder' },
    { id: 'context',  label: 'Context' },
    { id: 'tools',    label: 'Tools' },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <div id="header">
      <h1>prompt-tools</h1>
      <nav id="nav">
        {navItems.map(it => (
          <a key={it.id}
             href={`#/${it.id}`}
             className={'nav-link' + (route === it.id ? ' active' : '')}>
            {it.label}
          </a>
        ))}
      </nav>
      <div className="spacer"></div>
    </div>
  );
}
