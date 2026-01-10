import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Lovable Local Preview</h1>
        <p>Click elements in Visual Edit mode to target edits.</p>
      </header>
      <main className="app__main">
        <div className="card">
          <h2>Starter Counter</h2>
          <p>Count: {count}</p>
          <button onClick={() => setCount((value) => value + 1)}>Increment</button>
        </div>
      </main>
    </div>
  );
}
