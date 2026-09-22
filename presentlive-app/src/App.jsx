import { Route, Routes, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import HostEdit from "./pages/HostEdit";
import PresentationView from "./pages/PresentationView";
import PollResponses from "./pages/PollResponses";
import "./App.css";

function App() {
  const location = useLocation();
  const isAudienceView = location.pathname.startsWith("/presentation/");

  return (
    <div className="App">
      {!isAudienceView && <Header />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/edit/:id" element={<HostEdit />} />
        <Route path="/presentation/:id" element={<PresentationView />} />
        <Route path="/responses/:id" element={<PollResponses />} />
      </Routes>

      {!isAudienceView && <Footer />}
    </div>
  );
}

export default App;
