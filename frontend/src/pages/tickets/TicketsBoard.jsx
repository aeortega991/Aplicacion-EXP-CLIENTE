import { useOutletContext, useNavigate } from "react-router-dom";
import { ESTADOS, ESTADO_STYLE, fmtDT } from "./estados";

const BoardCard = ({ t, onOpen }) => (
  <button onClick={onOpen} className="w-full text-left bg-white border border-neutral-200 rounded-md p-3 hover:border-[#0033A0] hover:shadow-sm transition-colors" data-testid={`ts-board-card-${t.numero}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-[#0033A0]">{t.numero}</span>
      <span className="text-[11px] text-neutral-400">{fmtDT(t.created_at)}</span>
    </div>
    <div className="text-sm font-medium mt-1 truncate">{t.modelo} · {t.serie}</div>
    <div className="text-xs text-neutral-500 mt-1 line-clamp-2">{t.descripcion}</div>
    <div className="text-[11px] text-neutral-400 mt-2 truncate">{t.tecnico_nombre} → {t.analista_nombre || "Sin analista"}</div>
  </button>
);

export default function TicketsBoard() {
  const { data } = useOutletContext();
  const navigate = useNavigate();
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 snap-x" data-testid="ts-board">
      {ESTADOS.map((e) => {
        const items = data.items.filter((t) => t.estado === e);
        return (
          <div key={e} className="snap-start shrink-0 w-[82vw] sm:w-72 lg:w-auto lg:flex-1 lg:shrink lg:min-w-[190px] bg-neutral-100 rounded-lg border-t-4" style={{ borderTopColor: ESTADO_STYLE[e].color }} data-testid={`ts-board-col-${e}`}>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{e}</span>
              <span className="text-xs bg-white rounded-full px-2 py-0.5 tabular-nums">{items.length}</span>
            </div>
            <div className="px-2 pb-2 space-y-2 max-h-[65vh] overflow-y-auto">
              {items.length === 0 && <div className="text-xs text-neutral-400 text-center py-6">Sin tickets</div>}
              {items.map((t) => <BoardCard key={t.id} t={t} onOpen={() => navigate(`/tickets/t/${t.id}`)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
