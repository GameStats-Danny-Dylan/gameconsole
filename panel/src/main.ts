import "./style.css";
import { GameStatsClient } from "./api/GameStatsClient";
import { PanelStore } from "./store/PanelStore";
import { PanelView } from "./ui/PanelView";

const store = new PanelStore(new GameStatsClient("/api"), 3000);
const view = new PanelView(document.getElementById("app")!);

// Observer: la vista se suscribe a cada foto nueva del store.
store.subscribe((snapshot) => view.render(snapshot));

// Si el panel no se ve (pestaña en segundo plano), deja de consultar.
const sync = () => (document.hidden ? store.stop() : store.start());
document.addEventListener("visibilitychange", sync);
sync();
