import { FormEvent, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Status = "Disponible" | "Próximamente" | "Agotado";
type Product = {
  id: number;
  name: string;
  type: string;
  price: number;
  status: Status;
  sizes: string[];
};
type Speaker = {
  id: string;
  name: string;
  origin: string;
  role: string;
  photoUrl: string;
  socialUrl?: string;
};
type Order = {
  id: string;
  reference?: string;
  name: string;
  email: string;
  phone: string;
  item: string;
  size: string;
  total: number;
  status: string;
  code: string;
  paymentMethod?: string;
  disbursementStatus?: string;
};

async function prepareImageUpload(file: File): Promise<{ dataUrl: string; fileName: string }> {
  const targetBytes = 2.8 * 1024 * 1024;
  let blob: Blob = file;
  let fileName = file.name;
  if (file.size > targetBytes) {
    if (typeof createImageBitmap !== "function") {
      throw new Error("No se pudo optimizar la imagen en este navegador. Prueba una imagen menor a 2.8 MB.");
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    let scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
    let optimized: Blob | null = null;
    for (let dimensionAttempt = 0; dimensionAttempt < 5 && !optimized; dimensionAttempt++, scale *= 0.82) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) break;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.92, 0.84, 0.76, 0.68]) {
        const candidate = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (candidate && candidate.size <= targetBytes) {
          optimized = candidate;
          break;
        }
      }
    }
    bitmap.close();
    if (!optimized) throw new Error("No se pudo reducir la imagen lo suficiente para subirla.");
    blob = optimized;
    fileName = `${file.name.replace(/\.[^.]+$/, "")}.webp`;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("No se pudo leer la imagen."));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, fileName };
}

const seedSpeakers: Speaker[] = [
  {
    id: "speaker-sr",
    name: "Samuel Rodr\u00edguez",
    origin: "California, USA",
    role: "Pastor y conferencista",
    photoUrl: "",
    socialUrl: "",
  },
  {
    id: "speaker-cc",
    name: "Christine Caine",
    origin: "Sydney, Australia",
    role: "Autora y fundadora de A21",
    photoUrl: "",
    socialUrl: "",
  },
  {
    id: "speaker-dh",
    name: "Daniel Habif",
    origin: "Ciudad de M\u00e9xico",
    role: "Conferencista y autor",
    photoUrl: "",
    socialUrl: "",
  },
];
const seedProducts: Product[] = [
  {
    id: 1,
    name: "Camiseta Un Joven con la 10",
    type: "Camiseta",
    price: 25000,
    status: "Disponible",
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 2,
    name: "Gorra Un Joven con la 10",
    type: "Gorra",
    price: 18000,
    status: "Disponible",
    sizes: ["Ajustable"],
  },
  {
    id: 3,
    name: "Tote Bag Oficial",
    type: "Tote",
    price: 12000,
    status: "Próximamente",
    sizes: [],
  },
];
function TenMark({ className = "" }: { className?: string }) {
  return (
    <img
      className={`tenMark ${className}`}
      src="/assets/joven10-logo.png"
      alt="10"
    />
  );
}
const Brand = () => (
  <span className="brand">
    J<TenMark className="brandTenMark" />
  </span>
);
function Icon({ n }: { n: string }) {
  const x: Record<string, React.ReactNode> = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    cart: (
      <>
        <circle cx="9" cy="20" r="1" />
        <circle cx="19" cy="20" r="1" />
        <path d="M3 4h2l2 12h13l2-8H7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21v-2a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v2M17 5a4 4 0 0 1 0 7" />
      </>
    ),
    box: <path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10" />,
    download: <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />,
    trash: <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {x[n]}
    </svg>
  );
}

function ScrollReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}

function Header({ buy, lookup }: { buy: () => void; lookup: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="siteHead">
      <Brand />
      <nav className={open ? "open" : ""}>
        <a href="#horarios">Horarios</a>
        <a href="#invitados">Invitados</a>
        <a href="#merch">Merch</a>
        <a href="#localizacion">Ubicaci&oacute;n</a>
        <button
          className="lookupNav"
          onClick={() => {
            lookup();
            setOpen(false);
          }}
        >
          Confirmar mi pedido <Icon n="check" />
        </button>
        <button onClick={buy}>
          Comprar manilla <Icon n="arrow" />
        </button>
      </nav>
      <button className="hamb" onClick={() => setOpen(!open)}>
        <Icon n={open ? "close" : "menu"} />
      </button>
    </header>
  );
}
function Hero({ buy }: { buy: () => void }) {
  return (
    <section className="hero">
      <div className="orbit" />
      <div className="heroCopy">
        <p className="kicker">
          &mdash; CONGRESO JUVENIL &middot; 14, 15 Y 16 DE NOVIEMBRE DE 2026
        </p>
        <h1>
          UN JOVEN
          <br />
          <em>
            CON LA <TenMark className="heroTenMark" />.
          </em>
        </h1>
        <p>
          Tres d&iacute;as para encontrarnos, adorar y descubrir todo lo que
          Dios quiere hacer con nosotros.
        </p>
        <div className="actions">
          <button className="primary" onClick={buy}>
            Comprar mi manilla <Icon n="arrow" />
          </button>
          <a href="#horarios">Ver programaci&oacute;n &darr;</a>
        </div>
      </div>
      <div className="heroArt">
        <div>
          14&#8212;16 NOV &middot; UN JOVEN CON LA 10 &middot; 14&#8212;16 NOV
        </div>
        <img
          src="/assets/congreso-hero.png"
          alt="Congreso juvenil Un Joven con la 10"
        />
        <b>#CONLA10</b>
      </div>
    </section>
  );
}
const schedule = [
  [
    "14",
    "S\u00c1BADO",
    "7:00 PM",
    "Apertura: Encendiendo la llama",
    "Alabanza \u00b7 Mensaje \u00b7 Bienvenida",
  ],
  [
    "15",
    "DOMINGO",
    "5:00 PM",
    "Noche de prop\u00f3sito",
    "Panel \u00b7 Concierto \u00b7 Mensaje central",
  ],
  [
    "16",
    "LUNES",
    "9:00 AM",
    "Cierre: Somos enviados",
    "Celebraci\u00f3n \u00b7 Comuni\u00f3n \u00b7 Clausura",
  ],
];
function Title({
  id,
  children,
  text,
}: {
  id: string;
  children: React.ReactNode;
  text: string;
}) {
  return (
    <>
      <p className="sectionId">{id}</p>
      <div className="title">
        <h2>{children}</h2>
        <p>{text}</p>
      </div>
    </>
  );
}
function Schedule() {
  return (
    <section className="section schedule reveal" id="horarios">
      <Title
        id="01 — PROGRAMACIÓN"
        text={"14—16 de noviembre de 2026 · Iglesia El Shaddai"}
      >
        TRES DÍAS.
        <br />
        <em>UN SOLO PROPÓSITO.</em>
      </Title>
      <div className="scheduleList">
        {schedule.map((s, i) => (
          <article key={s[0]}>
            <strong>
              <small>0{i + 1}</small>
              {s[0]}
            </strong>
            <b>{s[1]}</b>
            <div>
              <h3>{s[3]}</h3>
              <p>{s[4]}</p>
            </div>
            <i>{s[2]}</i>
            <span>↗</span>
          </article>
        ))}
      </div>
    </section>
  );
}
function SpeakerPhoto({
  src,
  name,
  index,
  admin = false,
}: {
  src: string;
  name: string;
  index: number;
  admin?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "FOTO";
  if (src && !failed)
    return (
      <img
        className={admin ? "speakerAdminPhoto" : "portraitPhoto"}
        src={src}
        alt={name}
        onError={() => setFailed(true)}
      />
    );
  if (admin)
    return (
      <div
        className="speakerPhotoEmpty"
        title={src ? "No se pudo cargar la foto desde Drive" : "Sin foto"}
      >
        <strong>{initials}</strong>
        {src && <small>Foto no disponible</small>}
      </div>
    );
  return (
    <>
      <span>0{index + 1}</span>
      <strong>{initials}</strong>
      <i />
    </>
  );
}
function Speakers({
  background,
  speakers,
}: {
  background: string;
  speakers: Speaker[];
}) {
  return (
    <section
      className="section speakers reveal"
      id="invitados"
      style={
        background
          ? {
              backgroundImage: `linear-gradient(115deg,#102e3cf0,#102e3cb8),url("${background}")`,
            }
          : undefined
      }
    >
      <Title
        id="02 - INVITADOS"
        text="Conoce a quienes compartirán su historia y mensaje en el congreso."
      >
        VOCES QUE
        <br />
        <em>INSPIRAN.</em>
      </Title>
      <div
        className={`speakerGrid ${speakers.length === 2 ? "speakerGridTwo" : ""}`}
      >
        {speakers.map((person, i) => (
          <article key={person.id}>
            <div className={`portrait p${i % 3}`}>
              <SpeakerPhoto
                src={person.photoUrl}
                name={person.name}
                index={i}
              />
            </div>
            <div>
              <h3>{person.name}</h3>
              <p>{person.role}</p>
              <small>{person.origin}</small>
              {person.socialUrl && (
                <a
                  className="speakerSocialLink"
                  href={person.socialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver red social <Icon n="arrow" />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Merch({
  products,
  buy,
}: {
  products: Product[];
  buy: (p: Product) => void;
}) {
  return (
    <section className="section merch reveal" id="merch">
      <Title
        id="03 — MERCH OFICIAL"
        text="Piezas limitadas. Diseñadas para esta generación."
      >
        LA FE
        <br />
        <em>SE LLEVA.</em>
      </Title>
      {products.length > 0 && (
        <div className="productGrid">
          {products.map((p, i) => (
            <article key={p.id}>
              <div className={`productVisual v${i % 2}`}>
                <span className={`mock ${p.type.toLowerCase()}`}>
                  J<TenMark className="productTenMark" />
                </span>
                <small>
                  OFICIAL
                  <br />
                  MERCH
                </small>
              </div>
              <div className="productInfo">
                <div>
                  <span className="stock">{p.status}</span>
                  <h3>{p.name}</h3>
                  <p>
                    {p.sizes.length
                      ? "Tallas: " + p.sizes.join(" · ")
                      : "Edición limitada"}
                  </p>
                </div>
                <div>
                  <strong>${p.price.toLocaleString("es-CO")}</strong>
                  <button
                    disabled={p.status !== "Disponible"}
                    onClick={() => buy(p)}
                  >
                    <Icon n="cart" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function LocationSection() {
  const address = "Iglesia Cruzada Cristiana El Shaddai, Colombia";
  const googleMapsUrl = "https://maps.app.goo.gl/ZbEUD2f4iXf7aCHy5";
  return (
    <section className="section locationSection" id="localizacion">
      <p className="sectionId">04 - VIS&Iacute;TANOS</p>
      <div className="locationIntro">
        <h2>VEN A<br/><em>VISITARNOS.</em></h2>
        <p>Ven a visitarnos, te esperamos con los brazos abiertos.</p>
      </div>
      <div className="locationCard">
        <div className="locationMap">
          <iframe
            title="Ubicaci&oacute;n de la Iglesia Cruzada Cristiana El Shaddai en Google Maps"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3982.6746257345417!2d-76.4834984!3d3.4291567!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e30a7138b9c9a35%3A0xe3c13d789816090d!2sIglesia%20Cruzada%20Cristiana%20El%20Shaddai!5e0!3m2!1ses-419!2sco!4v1776660819431!5m2!1ses-419!2sco"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="locationDetails">
          <p className="kicker">IGLESIA CRUZADA CRISTIANA</p>
          <h3>El Shaddai</h3>
          <p className="locationAddress"><span aria-hidden="true">⌖</span>{address}</p>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            Abrir en Google Maps <Icon n="arrow" />
          </a>
          <small>Haz clic para obtener indicaciones desde tu ubicaci&oacute;n.</small>
        </div>
      </div>
    </section>
  );
}

function Band({ buy }: { buy: () => void }) {
  return (
    <section className="band reveal">
      <div>
        <p className="kicker">— TU ACCESO A TODO</p>
        <h2>
          VIVE
          <br />
          <em>ESTA EXPERIENCIA.</em>
        </h2>
        <p>
          Tu manilla te da acceso a las jornadas del congreso y a todas sus
          experiencias.
        </p>
        <button className="darkBtn" onClick={buy}>
          Obtener mi acceso <Icon n="arrow" />
        </button>
      </div>
      <div className="bandArt">
        <div>
          <small>CONGRESO</small>
          <b>
            JOVEN <TenMark className="bandTenMark" />
          </b>
          <small>14—16 NOV · ACCESO TOTAL</small>
        </div>
        <span>
          $30.000<small>ACCESO COMPLETO &middot; COP</small>
        </span>
      </div>
    </section>
  );
}
function QR({ code }: { code: string }) {
  return (
    <div className="qr">
      <QRCodeSVG
        value={`JOVEN10:${code}`}
        size={216}
        level="M"
        includeMargin
        bgColor="#ffffff"
        fgColor="#102e3c"
      />
    </div>
  );
}

function Checkout({
  product,
  close,
}: {
  product: Product | null;
  close: () => void;
}) {
  const [step, setStep] = useState(1),
    [size, setSize] = useState(product?.sizes[0] || ""),
    [data, setData] = useState({ name: "", email: "", phone: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [nequiReady, setNequiReady] = useState(false),
    [nequiInfo, setNequiInfo] = useState({
      paymentNumber: "",
      accountName: "",
      paymentQrUrl: "",
    });
  const item = product || {
    id: 0,
    name: "Manilla de acceso",
    type: "Entrada",
    price: 30000,
    status: "Disponible" as Status,
    sizes: [],
  };
  useEffect(() => {
    fetch("/api/payments/nequi/config")
      .then((r) => r.json())
      .then((d) => {
        setNequiReady(Boolean(d.ready));
        setNequiInfo({
          paymentNumber: d.paymentNumber || "",
          accountName: d.accountName || "",
          paymentQrUrl: d.paymentQrUrl || "",
        });
      })
      .catch(() => setNequiReady(false));
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/payments/nequi/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          itemId: product ? String(product.id) : "ticket",
          size,
          name: data.name,
          email: data.email,
          phone: data.phone,
          expectedPrice: item.price,
          expectedName: item.name,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo crear el pedido.");
      location.assign(`/?reference=${encodeURIComponent(d.reference)}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo conectar con el servidor de pagos.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay">
      <div className="modal">
        <button className="x" onClick={close}>
          <Icon n="close" />
        </button>
        <Brand />
        <form onSubmit={submit}>
          <div className="progress">
            <i style={{ width: `${step * 33}%` }} />
          </div>
          {step === 1 && (
            <div className="formStep">
              <p>01 - TU SELECCION</p>
              <h2>
                Elige tu
                <br />
                <em>acceso.</em>
              </h2>
              <div className="selection">
                <span>
                  <small>SELECCIONADO</small>
                  <b>{item.name}</b>
                </span>
                <strong>${item.price.toLocaleString("es-CO")} COP</strong>
              </div>
              {item.sizes.length > 0 && (
                <label>
                  Talla
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    required
                  >
                    {item.sizes.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="formStep">
              <p>02 - DATOS DEL COMPRADOR</p>
              <h2>
                Tus datos
                <br />
                <em>de contacto.</em>
              </h2>
              <label>
                Nombre completo
                <input
                  required
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  autoComplete="name"
                />
              </label>
              <label>
                Correo electronico
                <input
                  required
                  type="email"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                  autoComplete="email"
                />
              </label>
              <label>
                Tu numero de celular
                <input
                  required
                  type="tel"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value })}
                  autoComplete="tel"
                />
              </label>
              <small>
                Vincularemos a este numero el codigo de acceso de 4 digitos.
              </small>
            </div>
          )}
          {step === 3 && (
            <div className="formStep">
              <p>03 - PAGO</p>
              <h2>
                Revisa y<br />
                <em>continua.</em>
              </h2>
              <div className="summary">
                <span>
                  {item.name}
                  {size && <small> | Talla {size}</small>}
                  <b>${item.price.toLocaleString("es-CO")} COP</b>
                </span>
                <strong>
                  Total <b>${item.price.toLocaleString("es-CO")} COP</b>
                </strong>
              </div>
              {nequiReady && (
                <>
                  <img
                    className="nequiQr"
                    src={nequiInfo.paymentQrUrl || "/assets/nequi-qr.png"}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/assets/nequi-qr.png";
                    }}
                    alt="QR de Nequi para realizar el pago"
                  />
                  <p className="nequiRecipient">
                    Transfiere al numero <b>{nequiInfo.paymentNumber}</b>
                    {nequiInfo.accountName && (
                      <> - Titular: {nequiInfo.accountName}</>
                    )}
                  </p>
                </>
              )}
              <div className="demo">
                <Icon n="check" />
                <span>
                  <b>Pago manual por Nequi</b>
                  <small>
                    Transfiere el valor exacto. Un administrador confirmara el
                    pago antes de entregar tu codigo.
                  </small>
                </span>
              </div>
              {!nequiReady && (
                <p className="error">
                  El administrador aun no configura el QR y el numero de Nequi.
                </p>
              )}
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div className="formActions">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                Atras
              </button>
            )}
            <button
              className="primary"
              disabled={busy || (step === 3 && !nequiReady)}
            >
              {busy
                ? "Creando pedido..."
                : step === 3
                  ? "Crear pedido y continuar"
                  : "Continuar"}{" "}
              <Icon n="arrow" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function PaymentResult({ reference }: { reference: string }) {
  const [result, setResult] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,
      timer: number | undefined;
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/payments/status/${encodeURIComponent(reference)}`,
          { cache: "no-store" },
        );
        const d = await r.json();
        if (!r.ok)
          throw new Error(d.error || "No se pudo consultar el pedido.");
        if (stopped) return;
        setResult(d);
        if (d.status === "PENDING") timer = window.setTimeout(poll, 10000);
      } catch (e) {
        if (!stopped)
          setError(
            e instanceof Error ? e.message : "No se pudo consultar el pago.",
          );
      }
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference]);
  return (
    <section className="paymentResult">
      <p className="sectionId">ESTADO DEL PAGO</p>
      {error ? (
        <h2>{error}</h2>
      ) : !result ? (
        <h2>Consultando el pedido...</h2>
      ) : result.status === "APPROVED" ? (
        <>
          <p className="paymentBadge">PAGO CONFIRMADO</p>
          <h2>
            Tu acceso
            <br />
            <em>esta listo.</em>
          </h2>
          <p>
            {result.itemName}
            {result.size ? ` | Talla ${result.size}` : ""} - $
            {Number(result.amountInCents / 100).toLocaleString("es-CO")} COP
          </p>
          <div className="pass">
            <QR code={`${reference}:${result.pickupCode}`} />
            <div>
              <small>CODIGO DE 4 DIGITOS</small>
              <strong>{result.pickupCode}</strong>
              <span>Celular terminado en {result.phoneLast4}</span>
            </div>
          </div>
          <p>
            Este codigo esta vinculado al numero registrado. Presentalo al
            equipo del congreso.
          </p>
        </>
      ) : result.paymentMethod === "NEQUI_MANUAL" ? (
        <>
          <p className="paymentBadge">PEDIDO PENDIENTE DE CONFIRMACION</p>
          <h2>
            Paga con
            <br />
            <em>Nequi.</em>
          </h2>
          <p>
            Transfiere exactamente{" "}
            <b>
              ${Number(result.amountInCents / 100).toLocaleString("es-CO")} COP
            </b>{" "}
            al titular indicado.
          </p>
          <img
            className="nequiQr"
            src={result.paymentQrUrl || "/assets/nequi-qr.png"}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/assets/nequi-qr.png";
            }}
            alt="QR de Nequi para realizar el pago"
          />
          <p>
            Numero de Nequi: <b>{result.paymentNumber}</b>
            {result.accountName && <> - Titular: {result.accountName}</>}
          </p>
          <p>
            Referencia del pedido: <b>{reference}</b>
          </p>
          <p>
            Cuando el administrador confirme el pago, aqui aparecera tu codigo.
            El comprobante por si solo no confirma el pago.
          </p>
        </>
      ) : (
        <>
          <h2>Pedido pendiente</h2>
          <p>
            Estado: {result.status}. Contacta al equipo organizador para recibir
            ayuda.
          </p>
        </>
      )}
    </section>
  );
}
type LookupOrder = {
  orderSuffix: string;
  reference: string;
  pickupCode: string;
  createdAt: string;
  itemName: string;
  size: string;
  amountInCents: number;
  currency: string;
  paymentStatus: string;
  ticketDelivery: string;
  merchPickup: string;
};
function OrderLookup({ close }: { close: () => void }) {
  const [phone, setPhone] = useState(""),
    [orders, setOrders] = useState<LookupOrder[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOrders(null);
    try {
      const r = await fetch("/api/orders/lookup-by-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "No se pudo consultar el pedido.");
      setOrders(data.orders || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo consultar el pedido.",
      );
    } finally {
      setBusy(false);
    }
  };
  const label = (status: string) =>
    status === "APPROVED"
      ? "Pago confirmado"
      : status === "PENDING"
        ? "Pendiente de confirmacion"
        : status === "DECLINED"
          ? "Pago rechazado"
          : status === "VOIDED"
            ? "Pedido anulado"
            : status || "Estado no disponible";
  return (
    <div
      className="overlay lookupOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="lookupModal">
        <button className="x" onClick={close} aria-label="Cerrar">
          <Icon n="close" />
        </button>
        <p className="sectionId">CONSULTA DE PEDIDO</p>
        <h2>
          Confirma tu
          <br />
          <em>compra.</em>
        </h2>
        <p className="lookupIntro">
          Escribe el tel&eacute;fono que registraste al comprar para consultar
          el estado de tus pedidos.
        </p>
        <form onSubmit={lookup}>
          <label>
            N&uacute;mero de tel&eacute;fono
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 313 123 4567 o 313 123 4567"
              required
              minLength={7}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Buscando..." : "Consultar pedido"} <Icon n="arrow" />
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {orders !== null && (
          <div className="lookupResults" aria-live="polite">
            {orders.length === 0 ? (
              <p>
                No encontramos pedidos con ese n&uacute;mero. Revisa que sea el
                mismo que ingresaste al comprar.
              </p>
            ) : (
              orders.map((order, i) => (
                <article key={`${order.orderSuffix}-${i}`}>
                  <div className="lookupResultHead">
                    <strong>
                      {order.itemName}
                      {order.size ? <> &middot; Talla {order.size}</> : ""}
                    </strong>
                    <span className={`lookupStatus ${order.paymentStatus}`}>
                      {label(order.paymentStatus)}
                    </span>
                  </div>
                  <p>
                    Pedido &middot;&middot;&middot;{order.orderSuffix}{" "}
                    <b>
                      ${(order.amountInCents / 100).toLocaleString("es-CO")}{" "}
                      {order.currency}
                    </b>
                  </p>
                  {order.paymentStatus === "APPROVED" &&
                    order.pickupCode &&
                    order.reference && (
                      <>
                        <div className="lookupEntryPass">
                          <QR code={`${order.reference}:${order.pickupCode}`} />
                          <div>
                            <small>C&Oacute;DIGO DE ACCESO / RETIRO</small>
                            <strong>{order.pickupCode}</strong>
                            <span>Pedido confirmado</span>
                          </div>
                        </div>
                        <small className="lookupApprovedNote">
                          Muestra este QR o el c&oacute;digo de cuatro
                          d&iacute;gitos al equipo del congreso.
                        </small>
                      </>
                    )}
                  {order.paymentStatus === "APPROVED" && !order.pickupCode && (
                    <small>
                      Tu pago fue confirmado. El c&oacute;digo de acceso
                      a&uacute;n no est&aacute; disponible; contacta al equipo
                      organizador.
                    </small>
                  )}
                  {order.paymentStatus === "PENDING" && (
                    <small>
                      El equipo organizador debe validar el pago antes de
                      confirmar la entrega.
                    </small>
                  )}
                </article>
              ))
            )}
          </div>
        )}
        <small className="lookupPrivacy">
          El c&oacute;digo de acceso solo se muestra cuando el pago est&aacute;
          confirmado.
        </small>
      </section>
    </div>
  );
}
function Public({
  products,
  speakersBg,
  speakers,
  paymentReference,
}: {
  products: Product[];
  speakersBg: string;
  speakers: Speaker[];
  paymentReference: string;
}) {
  const [cart, setCart] = useState<{ open: boolean; p: Product | null }>({
      open: false,
      p: null,
    }),
    [lookupOpen, setLookupOpen] = useState(
      () => new URLSearchParams(location.search).get("confirmar") === "1",
    );
  const open = (p: Product | null = null) => setCart({ open: true, p });
  useEffect(() => {
    document.body.style.overflow = cart.open || lookupOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cart.open, lookupOpen]);
  return (
    <>
      <Header buy={() => open()} lookup={() => setLookupOpen(true)} />
      <ScrollReveal />
      <main>
        <Hero buy={() => open()} />
        {paymentReference && <PaymentResult reference={paymentReference} />}
        <Schedule />
        <Speakers background={speakersBg} speakers={speakers} />
        <Merch products={products} buy={open} />
        <Band buy={() => open()} />
        <LocationSection />
      </main>
      <footer>
        <div>
          JOVEN
          <TenMark className="footerTenMark" />
        </div>
        <span>© Un Joven con la 10 · 14—16 de noviembre de 2026</span>
        <nav className="socialLinks" aria-label="Redes sociales de la iglesia">
          <a
            href="https://www.instagram.com/iccelshaddai/"
            target="_blank"
            rel="noreferrer"
          >
            Instagram <span>↗</span>
          </a>
          <a
            href="https://www.facebook.com/iccelshaddai"
            target="_blank"
            rel="noreferrer"
          >
            Facebook <span>↗</span>
          </a>
        </nav>
      </footer>
      {cart.open && (
        <Checkout
          product={cart.p}
          close={() => setCart({ open: false, p: null })}
        />
      )}
      {lookupOpen && <OrderLookup close={() => setLookupOpen(false)} />}
    </>
  );
}

function Login({ go }: { go: () => void }) {
  const [u, setU] = useState(""),
    [p, setP] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: u, password: p }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo iniciar sesion.");
      go();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "API administrativa no disponible.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <div className="loginArt">
        <img src="/assets/congreso-hero.png" />
        <h1>
          Administracion
          <br />
          <em>del congreso.</em>
        </h1>
      </div>
      <form onSubmit={submit}>
        <button type="button" onClick={() => location.assign("/")}>
          Volver al sitio
        </button>
        <Brand />
        <p>ACCESO ADMINISTRATIVO</p>
        <h2>
          Iniciar
          <br />
          <em>sesion.</em>
        </h2>
        <label>
          Usuario
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Contrasena
          <input
            value={p}
            onChange={(e) => setP(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <small className="error">{error}</small>}
        <button className="primary" disabled={busy}>
          {busy ? "Validando..." : "Entrar al dashboard"} <Icon n="arrow" />
        </button>
        <small>La cuenta se valida en el servidor.</small>
      </form>
    </div>
  );
}
function AppearanceSettings({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Usa una imagen JPG, PNG o WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("La imagen debe pesar menos de 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const image = await prepareImageUpload(file);
      const r = await fetch("/api/admin/speakers-background", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(image),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar la imagen.");
      onChange(d.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  const clear = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/speakers-background", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ clear: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo restaurar el fondo.");
      onChange("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo conectar con el servidor.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel appearancePanel">
      <h2>Fondo de invitados</h2>
      <p>
        Sube una imagen compartida: se guarda en Drive y su enlace en la hoja
        Configuracion para que la vean todos los visitantes.
      </p>
      {value && (
        <div
          className="appearancePreview"
          style={{
            backgroundImage: `linear-gradient(#102e3c44,#102e3c44),url("${value}")`,
          }}
        >
          <span>Vista previa de Invitados</span>
        </div>
      )}
      <label className="uploadLabel">
        {busy ? "Guardando..." : "Elegir imagen"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          disabled={busy}
        />
      </label>
      {value && (
        <button className="clearImage" onClick={clear} disabled={busy}>
          Restaurar fondo original
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <small>
        JPG, PNG o WebP. Maximo 8 MB. La imagen sera publica mediante enlace.
      </small>
    </section>
  );
}
function PaymentSettings() {
  const [phone, setPhone] = useState(""),
    [accountName, setAccountName] = useState(""),
    [orderNotificationEmails, setOrderNotificationEmails] = useState<string[]>([]),
    [newNotificationEmail, setNewNotificationEmail] = useState(""),
    [qrUrl, setQrUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [testingEmail, setTestingEmail] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/admin/payment-settings", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setPhone(d.nequiPaymentNumber || "");
          setAccountName(d.nequiAccountName || "");
          setOrderNotificationEmails(Array.isArray(d.orderNotificationEmails)
            ? d.orderNotificationEmails
            : (d.orderNotificationEmail ? [d.orderNotificationEmail] : []));
          setQrUrl(d.nequiPaymentQrUrl || "");
        } else setError(d.error);
      })
      .catch(() =>
        setError("No se pudo cargar la configuracion desde Google Sheets."),
      );
  }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/payment-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          nequiPaymentNumber: phone,
          nequiAccountName: accountName,
          orderNotificationEmails,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar.");
      setMessage("Datos de pago guardados en Google Sheets.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la configuracion.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sendTestEmail = async () => {
    setTestingEmail(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/test-order-email", {
        method: "POST",
        credentials: "same-origin",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo enviar el correo de prueba.");
      setMessage(`Correo de prueba enviado a ${(Array.isArray(d.sentTo) ? d.sentTo : [d.sentTo]).join(", ")}. Revisa Recibidos y Spam.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el correo de prueba.");
    } finally {
      setTestingEmail(false);
    }
  };
  const addNotificationEmail = () => {
    const email = newNotificationEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Escribe un correo valido para agregarlo.");
      return;
    }
    if (orderNotificationEmails.includes(email)) {
      setError("Ese correo ya esta en la lista.");
      return;
    }
    if (orderNotificationEmails.length >= 10) {
      setError("Puedes agregar hasta 10 correos.");
      return;
    }
    setOrderNotificationEmails([...orderNotificationEmails, email]);
    setNewNotificationEmail("");
    setError("");
    setMessage("");
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Usa una imagen JPG, PNG o WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("El QR debe pesar menos de 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const image = await prepareImageUpload(file);
      const r = await fetch("/api/admin/payment-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(image),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar el QR.");
      setQrUrl(d.imageUrl);
      setMessage("QR guardado en Drive y su enlace en Google Sheets.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el QR.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  const clear = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/payment-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ clear: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo quitar el QR.");
      setQrUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el QR.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel appearancePanel">
      <h2>Pago manual por Nequi</h2>
      <p>
        Los compradores veran estos datos. El pago queda pendiente hasta que un
        administrador revise el movimiento y lo confirme.
      </p>
      <form onSubmit={save}>
        <label>
          Numero de Nequi
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Tu numero de celular"
            required
          />
        </label>
        <label>
          Nombre del titular
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Nombre que vera quien paga"
            required
          />
        </label>
        <label>Correos para avisos de nuevos pedidos</label>
        <div className="notificationEmailList">
          {orderNotificationEmails.map((email) => (
            <div className="notificationEmailRow" key={email}>
              <span>{email}</span>
              <button type="button" aria-label={`Quitar ${email}`} onClick={() => setOrderNotificationEmails(orderNotificationEmails.filter((item) => item !== email))}>Quitar</button>
            </div>
          ))}
          <div className="notificationEmailAdd">
            <input type="email" value={newNotificationEmail} onChange={(e) => setNewNotificationEmail(e.target.value)} placeholder="organizacion@ejemplo.com" autoComplete="email" />
            <button type="button" onClick={addNotificationEmail}>Agregar</button>
          </div>
        </div>
        <small>
          Se enviara un aviso a cada correo cuando se cree un pedido manual por Nequi. Puedes guardar hasta 10 destinatarios.
        </small>
        <button className="primary" disabled={busy}>
          {busy ? "Guardando..." : "Guardar datos de Nequi"}
        </button>
      </form>
      <button
        type="button"
        className="clearImage"
        onClick={sendTestEmail}
        disabled={busy || testingEmail || orderNotificationEmails.length === 0}
      >
        {testingEmail ? "Enviando prueba..." : "Enviar correo de prueba"}
      </button>
      {qrUrl && (
        <div className="nequiQrPreview">
          <img
            src={qrUrl}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/assets/nequi-qr.png";
            }}
            alt="Vista previa del QR de Nequi"
          />
        </div>
      )}
      <label className="uploadLabel">
        {busy ? "Guardando..." : "Subir QR de Nequi"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          disabled={busy}
        />
      </label>
      {qrUrl && (
        <button className="clearImage" onClick={clear} disabled={busy}>
          Quitar QR
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {message && <p className="credentialSuccess">{message}</p>}
      <small>
        El QR, numero de Nequi y correo para avisos se guardan en Google Sheets.
        El correo no se muestra a los compradores.
      </small>
    </section>
  );
}
function SpeakerSettings({
  value,
  onChange,
}: {
  value: Speaker[];
  onChange: (speakers: Speaker[]) => void;
}) {
  const [speakers, setSpeakers] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => setSpeakers(value), [value]);
  const update = (id: string, patch: Partial<Speaker>) =>
    setSpeakers((current) =>
      current.map((person) =>
        person.id === id ? { ...person, ...patch } : person,
      ),
    );
  const add = () =>
    setSpeakers((current) => [
      ...current,
      {
        id:
          globalThis.crypto?.randomUUID?.() ||
          `speaker-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: "",
        origin: "",
        role: "",
        photoUrl: "",
        socialUrl: "",
      },
    ]);
  const remove = (id: string) =>
    setSpeakers((current) => current.filter((person) => person.id !== id));
  const uploadPhoto = async (
    id: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Usa una foto JPG, PNG o WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("La foto debe pesar menos de 8 MB.");
      event.target.value = "";
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const image = await prepareImageUpload(file);
      const response = await fetch("/api/admin/speaker-photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(image),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo subir la foto.");
      update(id, { photoUrl: data.imageUrl });
      setMessage("Foto subida a Drive. Guarda los cambios para publicar el perfil.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/speakers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ speakers }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "No se pudieron guardar los predicadores.",
        );
      const saved: Speaker[] = data.speakers || speakers;
      setSpeakers(saved);
      onChange(saved);
      setMessage("Predicadores guardados en Google Sheets.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar los predicadores.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="speakerSettings">
      <div className="speakerSettingsIntro">
        <div>
          <p className="sectionId">SECCION DE INVITADOS</p>
          <h2>Predicadores</h2>
          <p>
            Administra el nombre, lugar de origen, descripcion y foto que se
            muestran en la pagina publica.
          </p>
        </div>
        <button className="speakerAdd" onClick={add}>
          + Agregar predicador
        </button>
      </div>
      <div className="speakerAdminList">
        {speakers.map((person, index) => (
          <article className="speakerAdminCard" key={person.id}>
            <div className="speakerPhotoField">
              <SpeakerPhoto
                src={person.photoUrl}
                name={person.name}
                index={index}
                admin
              />
              <label className="speakerPhotoButton">
                {busy ? "Subiendo..." : "Cambiar foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => uploadPhoto(person.id, event)}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="speakerFields">
              <div className="speakerFieldRow">
                <label>
                  Nombre del predicador
                  <input
                    value={person.name}
                    onChange={(event) =>
                      update(person.id, { name: event.target.value })
                    }
                    maxLength={120}
                    placeholder="Nombre completo"
                  />
                </label>
                <label>
                  Lugar de origen
                  <input
                    value={person.origin}
                    onChange={(event) =>
                      update(person.id, { origin: event.target.value })
                    }
                    maxLength={120}
                    placeholder="Ciudad, pais"
                  />
                </label>
              </div>
              <label>
                Que es / descripcion
                <input
                  value={person.role}
                  onChange={(event) =>
                    update(person.id, { role: event.target.value })
                  }
                  maxLength={160}
                  placeholder="Pastor, conferencista, autor..."
                />
              </label>
              <label>
                Red social (opcional)
                <input
                  type="url"
                  value={person.socialUrl || ""}
                  onChange={(event) =>
                    update(person.id, { socialUrl: event.target.value })
                  }
                  maxLength={500}
                  placeholder="https://instagram.com/usuario"
                />
              </label>
              <small>
                Invitado {String(index + 1).padStart(2, "0")} ·{" "}
                {person.photoUrl ? "Foto cargada" : "Sin foto"}
              </small>
            </div>
            <button
              className="speakerRemove"
              onClick={() => remove(person.id)}
              aria-label={`Quitar a ${person.name || "predicador"}`}
            >
              <Icon n="trash" />
            </button>
          </article>
        ))}
        {speakers.length === 0 && (
          <div className="speakerEmptyState">
            Aun no agregas predicadores. Usa “Agregar predicador” para crear el
            primer perfil.
          </div>
        )}
      </div>
      <div className="speakerSettingsActions">
        <div>
          {error && <p className="error">{error}</p>}
          {message && <p className="credentialSuccess">{message}</p>}
          <small>
            Las fotos se guardan en Drive y los perfiles en la hoja
            Predicadores.
          </small>
        </div>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </section>
  );
}

type ScanResult = {
  valid: boolean;
  alreadyUsed: boolean;
  order: {
    reference: string;
    buyerName: string;
    itemName: string;
    size: string;
    amountInCents: number;
    paymentStatus: string;
    deliveryStatus: string;
  };
};
type QRDetectorConstructor = new (options?: { formats: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};
function ValidationPanel() {
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false),
    [error, setError] = useState(""),
    [scanError, setScanError] = useState(""),
    [result, setResult] = useState<ScanResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null),
    validateRef = useRef<(value: string) => Promise<void>>(async () => {});
  const validate = async (value: string) => {
    const parts = value.trim().split(":");
    let reference = "",
      pickupCode = "";
    if (parts.length === 3 && parts[0] === "JOVEN10") {
      reference = parts[1];
      pickupCode = parts[2];
    } else if (/^\d{4}$/.test(value.trim())) pickupCode = value.trim();
    else {
      setError(
        "Ingresa los cuatro digitos o escanea el QR completo del acceso.",
      );
      setResult(null);
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/validate-entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ reference, pickupCode }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo validar el acceso.");
      setResult(data as ScanResult);
      setInput("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo validar el acceso.",
      );
    } finally {
      setBusy(false);
    }
  };
  validateRef.current = validate;
  useEffect(() => {
    if (!scanning) return;
    let active = true,
      stream: MediaStream | undefined,
      frame = 0;
    const start = async () => {
      const Detector = (
        window as unknown as { BarcodeDetector?: QRDetectorConstructor }
      ).BarcodeDetector;
      if (!Detector) {
        setScanError(
          "Este navegador no incluye lector QR por cámara. Ingresa el código manualmente o abre la dashboard en Chrome.",
        );
        setScanning(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanError(
          "La cámara requiere una conexión HTTPS o localhost. Puedes ingresar el código manualmente.",
        );
        setScanning(false);
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!active) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) {
            active = false;
            setScanning(false);
            void validateRef.current(codes[0].rawValue);
            return;
          }
        } catch {
          setScanError(
            "No se pudo leer el QR. Mantén el código dentro del recuadro e inténtalo de nuevo.",
          );
        }
        frame = requestAnimationFrame(scan);
      };
      frame = requestAnimationFrame(scan);
    };
    start().catch((err) => {
      setScanError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Permite el acceso a la cámara para escanear el QR."
          : "No se pudo iniciar la cámara. Ingresa el código manualmente.",
      );
      setScanning(false);
    });
    return () => {
      active = false;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void validate(input);
  };
  return (
    <section className="validationPage">
      <div className="validationHeading">
        <p className="sectionId">CONTROL DE ACCESO</p>
        <h2>
          Validar
          <br />
          <em>pedido.</em>
        </h2>
        <p>
          Escanea el QR de la manilla o escribe el código de cuatro dígitos. El
          sistema confirma que el pedido esté aprobado y evita validarlo dos
          veces.
        </p>
      </div>
      <div className="validationGrid">
        <article className="validationCard scannerCard">
          <div>
            <span className="validationStep">01</span>
            <h3>Escanear QR</h3>
            <p>
              Usa la cámara trasera del dispositivo para leer el código
              completo.
            </p>
          </div>
          {scanning ? (
            <div className="cameraFrame">
              <video ref={videoRef} muted playsInline />
              <span className="scanReticle" />
            </div>
          ) : (
            <div className="cameraPlaceholder">
              <Icon n="check" />
              <span>El lector se activa al iniciar el escaneo.</span>
            </div>
          )}
          <button
            className="primary"
            onClick={() => {
              setScanError("");
              setError("");
              setResult(null);
              setScanning(!scanning);
            }}
          >
            {scanning ? "Detener cámara" : "Activar cámara"} <Icon n="check" />
          </button>
          {scanError && <p className="validationError">{scanError}</p>}
        </article>
        <article className="validationCard manualCard">
          <div>
            <span className="validationStep">02</span>
            <h3>Ingresar código</h3>
            <p>
              Escribe los cuatro dígitos que aparecen junto al QR de acceso.
            </p>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="entry-code">Código de acceso</label>
            <input
              id="entry-code"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              placeholder="0000"
              value={input}
              onChange={(event) =>
                setInput(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <button className="primary" disabled={busy || input.length !== 4}>
              {busy ? "Validando..." : "Validar código"} <Icon n="arrow" />
            </button>
          </form>
          <small>
            Si el código coincide con más de un pedido, escanea el QR completo.
          </small>
        </article>
      </div>
      {error && (
        <div className="validationNotice invalid">
          <Icon n="close" />
          <div>
            <strong>No se pudo validar</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
      {result && (
        <div
          className={`validationNotice ${result.alreadyUsed ? "used" : "valid"}`}
        >
          <Icon n={result.alreadyUsed ? "close" : "check"} />
          <div>
            <strong>
              {result.alreadyUsed
                ? "Este pedido ya fue validado"
                : "Pedido válido · Pago confirmado"}
            </strong>
            <p>
              {result.order.buyerName} · {result.order.itemName}
              {result.order.size ? ` · Talla ${result.order.size}` : ""}
            </p>
            <small>
              Pedido ···{result.order.reference.slice(-6)} ·{" "}
              {result.alreadyUsed
                ? "No permitir un segundo ingreso o retiro."
                : "Código registrado como utilizado."}
            </small>
          </div>
        </div>
      )}
    </section>
  );
}
function CredentialSettings() {
  const [username, setUsername] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/admin/profile", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d.username) setUsername(d.username);
        else if (d.error) setError(d.error);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, currentPassword, newPassword }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se guardaron los cambios.");
      setMessage("Usuario y contrasena actualizados.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar los cambios.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel credentialPanel">
      <h2>Acceso administrativo</h2>
      <p>
        La contrasena se guarda como hash con sal en la hoja Admin. Nunca se
        guarda en texto legible.
      </p>
      <form onSubmit={save}>
        <label>
          Nuevo usuario
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={40}
            required
          />
        </label>
        <label>
          Contrasena actual
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Nueva contrasena
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <small>Minimo 12 caracteres.</small>
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="credentialSuccess">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </section>
  );
}
function Table({
  orders,
  onConfirm,
  onEdit,
  onDelete,
}: {
  orders: Order[];
  onConfirm?: (reference: string) => void;
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
}) {
  const hasActions = Boolean(onConfirm || onEdit || onDelete);
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            <th>COMPRADOR</th>
            <th>ORDEN</th>
            <th>PRODUCTO</th>
            <th>TOTAL</th>
            <th>PAGO</th>
            <th>METODO</th>
            <th>DESEMBOLSO</th>
            {hasActions && <th>ACCIONES</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <b>{o.name}</b>
                <small>{o.email}</small>
                <small>{o.phone}</small>
              </td>
              <td>
                <b>{o.id}</b>
                <small>Codigo {o.code}</small>
              </td>
              <td>
                <b>{o.item}</b>
                <small>{!o.size ? "Acceso" : `Talla ${o.size}`}</small>
              </td>
              <td>
                <b>${o.total.toLocaleString("es-CO")}</b>
              </td>
              <td>
                <span className={o.status}>{o.status}</span>
              </td>
              <td>
                {o.paymentMethod === "NEQUI_MANUAL"
                  ? "Nequi (manual)"
                  : o.paymentMethod || "-"}
              </td>
              <td>{o.disbursementStatus || "Por confirmar"}</td>
              {hasActions && (
                <td>
                  <div className="buyerRowActions">
                  {onConfirm && o.paymentMethod === "NEQUI_MANUAL" &&
                    o.status === "PENDING" && (
                      <button
                        className="confirmPayment"
                        onClick={() => onConfirm(o.reference || o.id)}
                      >
                        Confirmar pago
                      </button>
                    )}
                  {onEdit && <button className="buyerEditButton" onClick={() => onEdit(o)}>Editar</button>}
                  {onDelete && <button className="buyerDeleteButton" onClick={() => onDelete(o)}>Eliminar</button>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Admin({
  products,
  setProducts,
  orders: initialOrders,
  logout,
  speakersBg,
  setSpeakersBg,
  speakers,
  setSpeakers,
}: {
  products: Product[];
  setProducts: (p: Product[]) => void;
  orders: Order[];
  logout: () => void;
  speakersBg: string;
  setSpeakersBg: (value: string) => void;
  speakers: Speaker[];
  setSpeakers: (speakers: Speaker[]) => void;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [editingBuyer, setEditingBuyer] = useState<Order | null>(null);
  const [buyerForm, setBuyerForm] = useState({ name: "", email: "", phone: "" });
  const [buyerBusy, setBuyerBusy] = useState(false);
  const [buyerError, setBuyerError] = useState("");
  useEffect(() => setOrders(initialOrders), [initialOrders]);
  const confirmNequi = async (reference: string) => {
    if (
      !window.confirm(
        "Confirma solo despues de revisar que el dinero llego a tu Nequi. Confirmar este pedido como pagado?",
      )
    )
      return;
    try {
      const r = await fetch(
        `/api/admin/orders/${encodeURIComponent(reference)}/confirm-nequi`,
        { method: "POST", credentials: "same-origin" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo confirmar el pago.");
      const refreshed = await fetch("/api/admin/orders", {
        credentials: "same-origin",
      });
      const data = await refreshed.json();
      setOrders(data.orders || []);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "No se pudo confirmar el pago.",
      );
    }
  };
  const editBuyer = (order: Order) => {
    setBuyerForm({ name: order.name, email: order.email, phone: order.phone });
    setBuyerError("");
    setEditingBuyer(order);
  };
  const saveBuyer = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingBuyer) return;
    setBuyerBusy(true);
    setBuyerError("");
    try {
      const reference = editingBuyer.reference || editingBuyer.id;
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(reference)}/buyer`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName: buyerForm.name, email: buyerForm.email, phone: buyerForm.phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar el comprador.");
      setOrders((current) => current.map((order) => order.id === editingBuyer.id
        ? { ...order, name: buyerForm.name.trim(), email: buyerForm.email.trim(), phone: buyerForm.phone.trim() }
        : order));
      setEditingBuyer(null);
    } catch (error) {
      setBuyerError(error instanceof Error ? error.message : "No se pudo actualizar el comprador.");
    } finally {
      setBuyerBusy(false);
    }
  };
  const deleteBuyer = async (order: Order) => {
    if (!window.confirm(`¿Eliminar el pedido ${order.id} de ${order.name}? Se borrarán sus datos de comprador y este pedido de la hoja. Esta acción no se puede deshacer.`)) return;
    try {
      const reference = order.reference || order.id;
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(reference)}`, {
        method: "DELETE", credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar el pedido.");
      setOrders((current) => current.filter((candidate) => candidate.id !== order.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo eliminar el pedido.");
    }
  };
  const clearBuyers = async () => {
    if (!orders.length) return;
    if (!window.confirm(`¿Vaciar todos los compradores? Se eliminarán ${orders.length} pedidos, incluidos los datos de contacto, pagos y códigos de acceso. Se conservarán los encabezados de la hoja. Esta acción no se puede deshacer.`)) return;
    try {
      const response = await fetch("/api/admin/orders", { method: "DELETE", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron vaciar los compradores.");
      setOrders([]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudieron vaciar los compradores.");
    }
  };
  const [tab, setTab] = useState("resumen"),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState("Todos");
  const shown = orders.filter(
      (o) =>
        (filter === "Todos" || o.status === filter) &&
        `${o.name} ${o.email} ${o.phone} ${o.id}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    ),
    size = (s: string) =>
      orders.filter((o) => o.size === s && o.status === "APPROVED").length;
  return (
    <div className="admin">
      <aside>
        <Brand />
        <nav>
          <button
            className={tab === "resumen" ? "active" : ""}
            onClick={() => setTab("resumen")}
          >
            <Icon n="grid" /> Resumen
          </button>
          <button
            className={tab === "validar" ? "active" : ""}
            onClick={() => setTab("validar")}
          >
            <Icon n="check" /> Validar acceso
          </button>
          <button
            className={tab === "compradores" ? "active" : ""}
            onClick={() => setTab("compradores")}
          >
            <Icon n="users" /> Compradores <i>{orders.length}</i>
          </button>
          <button
            className={tab === "productos" ? "active" : ""}
            onClick={() => setTab("productos")}
          >
            <Icon n="box" /> Productos
          </button>
          <button
            className={tab === "predicadores" ? "active" : ""}
            onClick={() => setTab("predicadores")}
          >
            <Icon n="users" /> Predicadores
          </button>
          <button
            className={tab === "configuracion" ? "active" : ""}
            onClick={() => setTab("configuracion")}
          >
            Acceso y seguridad
          </button>
          <button
            className={tab === "apariencia" ? "active" : ""}
            onClick={() => setTab("apariencia")}
          >
            Apariencia
          </button>
          <button
            className={tab === "pagos" ? "active" : ""}
            onClick={() => setTab("pagos")}
          >
            Pagos
          </button>
        </nav>
        <div>
          <button onClick={() => location.assign("/")}>Ver sitio</button>
          <button onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <main>
        <header>
          <p>CONGRESO UN JOVEN CON LA 10</p>
          <h1>
            {tab === "resumen"
              ? "Buenos días, Admin."
              : tab === "compradores"
                ? "Compradores"
                : tab === "productos"
                  ? "Productos"
                  : tab === "configuracion"
                    ? "Acceso y seguridad"
                    : tab === "pagos"
                      ? "Pagos"
                      : tab === "validar"
                        ? "Validar acceso"
                        : tab === "predicadores"
                          ? "Predicadores"
                          : "Apariencia"}
          </h1>
        </header>
        <div className="adminBody">
          {tab === "validar" && <ValidationPanel />}
          {tab === "resumen" && (
            <>
              <div className="stats">
                <article className="featured">
                  <span>VENTAS TOTALES</span>
                  <strong>
                    $
                    {orders
                      .filter((o) => o.status === "APPROVED")
                      .reduce((a, o) => a + o.total, 0)}
                  </strong>
                  <small>↑ 18.2% esta semana</small>
                </article>
                <article>
                  <span>ASISTENTES</span>
                  <strong>{orders.length}</strong>
                  <small>Nuevos registros</small>
                </article>
                <article>
                  <span>POR VALIDAR</span>
                  <strong>
                    {orders.filter((o) => o.status === "PENDING").length}
                  </strong>
                  <small>Requieren atención</small>
                </article>
                <article>
                  <span>MERCH VENDIDO</span>
                  <strong>
                    {
                      orders.filter(
                        (o) =>
                          o.status === "APPROVED" &&
                          !o.item.includes("Manilla"),
                      ).length
                    }
                  </strong>
                  <small>Unidades</small>
                </article>
              </div>
              <div className="panels">
                <section>
                  <h2>Últimas compras</h2>
                  <Table orders={orders.slice(0, 4)} />
                </section>
                <section>
                  <h2>Camisas por talla</h2>
                  <div className="bars">
                    {["S", "M", "L", "XL"].map((s, i) => (
                      <div key={s}>
                        <i>
                          <b style={{ height: 30 + size(s) * 28 + i * 8 }} />
                        </i>
                        <strong>{size(s)}</strong>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "compradores" && (
            <>
              <div className="tools">
                <input
                  placeholder="Buscar nombre, correo o código..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>Todos</option>
                  <option>APPROVED</option>
                  <option>PENDING</option>
                  <option>DECLINED</option>
                  <option>ERROR</option>
                </select>
                <button onClick={() => window.print()}>
                  <Icon n="download" /> Exportar PDF
                </button>
                {orders.length > 0 && <button className="buyerClearButton" onClick={clearBuyers}>Vaciar compradores</button>}
              </div>
              <p className="buyerTableNote">Cada fila representa un pedido; un comprador puede aparecer más de una vez.</p>
              <section className="panel">
                <Table orders={shown} onConfirm={confirmNequi} onEdit={editBuyer} onDelete={deleteBuyer} />
              </section>
            </>
          )}
          {tab === "predicadores" && (
            <SpeakerSettings value={speakers} onChange={setSpeakers} />
          )}
          {tab === "configuracion" && <CredentialSettings />}
          {tab === "pagos" && <PaymentSettings />}
          {tab === "apariencia" && (
            <AppearanceSettings value={speakersBg} onChange={setSpeakersBg} />
          )}
          {tab === "productos" && (
            <>
              <div className="productHead">
                <span>{products.length} productos</span>
                <button
                  onClick={() =>
                    setProducts([
                      ...products,
                      {
                        id: Date.now(),
                        name: "Nuevo producto",
                        type: "Merch",
                        price: 20,
                        status: "Próximamente",
                        sizes: [],
                      },
                    ])
                  }
                >
                  + Agregar producto
                </button>
              </div>
              <div className="productAdmin">
                {products.map((p) => (
                  <article key={p.id}>
                    <div className="thumb">J10</div>
                    <label>
                      PRODUCTO
                      <input
                        value={p.name}
                        onChange={(e) =>
                          setProducts(
                            products.map((x) =>
                              x.id === p.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                      <small>
                        {p.sizes.length
                          ? "Tallas: " + p.sizes.join(", ")
                          : "Sin tallas"}
                      </small>
                    </label>
                    <label>
                      PRECIO COP
                      <input
                        type="number"
                        value={p.price}
                        onChange={(e) =>
                          setProducts(
                            products.map((x) =>
                              x.id === p.id
                                ? { ...x, price: +e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      TALLAS (separadas por coma)
                      <input
                        value={p.sizes.join(", ")}
                        onChange={(e) =>
                          setProducts(
                            products.map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    sizes: e.target.value
                                      .split(",")
                                      .map((v) => v.trim())
                                      .filter(Boolean),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      ESTADO
                      <select
                        value={p.status}
                        onChange={(e) =>
                          setProducts(
                            products.map((x) =>
                              x.id === p.id
                                ? { ...x, status: e.target.value as Status }
                                : x,
                            ),
                          )
                        }
                      >
                        <option>Disponible</option>
                        <option>Próximamente</option>
                        <option>Agotado</option>
                      </select>
                    </label>
                    <button
                      onClick={() =>
                        setProducts(products.filter((x) => x.id !== p.id))
                      }
                    >
                      <Icon n="trash" />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      {editingBuyer && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !buyerBusy) setEditingBuyer(null); }}>
          <section className="modal buyerEditModal" role="dialog" aria-modal="true" aria-labelledby="buyerEditTitle">
            <button className="x" type="button" aria-label="Cerrar" onClick={() => setEditingBuyer(null)}>✕</button>
            <p>Pedido {editingBuyer.id} · {editingBuyer.item}</p>
            <h2 id="buyerEditTitle">Editar comprador</h2>
            <form onSubmit={saveBuyer}>
              <label>Nombre completo<input required maxLength={120} value={buyerForm.name} onChange={(event) => setBuyerForm({ ...buyerForm, name: event.target.value })} /></label>
              <label>Correo electrónico<input required type="email" maxLength={254} value={buyerForm.email} onChange={(event) => setBuyerForm({ ...buyerForm, email: event.target.value })} /></label>
              <label>Teléfono<input required type="tel" maxLength={24} value={buyerForm.phone} onChange={(event) => setBuyerForm({ ...buyerForm, phone: event.target.value })} /></label>
              {buyerError && <p className="error">{buyerError}</p>}
              <div className="formActions"><button type="button" disabled={buyerBusy} onClick={() => setEditingBuyer(null)}>Cancelar</button><button className="primary" disabled={buyerBusy}>{buyerBusy ? "Guardando..." : "Guardar cambios"}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
export function AdminApp() {
  const [logged, setLogged] = useState(false),
    [authReady, setAuthReady] = useState(false);
  const [products, setP] = useState<Product[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("j10-products") || "") || seedProducts
      );
    } catch {
      return seedProducts;
    }
  });
  const [orders, setO] = useState<Order[]>([]),
    [speakersBg, setSpeakersBg] = useState(""),
    [speakers, setSpeakers] = useState<Speaker[]>(seedSpeakers);
  useEffect(() => {
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setLogged(Boolean(d.authenticated)))
      .catch(() => setLogged(false))
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    if (!logged) return;
    fetch("/api/admin/orders", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setO(d.orders || []))
      .catch(() => setO([]));
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((d) => setSpeakersBg(d.speakersBackgroundUrl || ""))
      .catch(() => {});
    fetch("/api/admin/speakers", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.speakers))
          setSpeakers(
            d.configured
              ? d.speakers
              : d.speakers.length
                ? d.speakers
                : seedSpeakers,
          );
      })
      .catch(() => {});
  }, [logged]);
  const saveP = (p: Product[]) => {
    setP(p);
    localStorage.setItem("j10-products", JSON.stringify(p));
  };
  const logout = async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
    setLogged(false);
  };
  if (!authReady) return null;
  if (!logged) return <Login go={() => setLogged(true)} />;
  return (
    <Admin
      products={products}
      setProducts={saveP}
      orders={orders}
      logout={logout}
      speakersBg={speakersBg}
      setSpeakersBg={setSpeakersBg}
      speakers={speakers}
      setSpeakers={setSpeakers}
    />
  );
}

export default function App() {
  const [products] = useState<Product[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("j10-products") || "") || seedProducts
      );
    } catch {
      return seedProducts;
    }
  });
  const [speakersBg, setSpeakersBg] = useState(""),
    [speakers, setSpeakers] = useState<Speaker[]>(seedSpeakers),
    [paymentReference] = useState(
      () => new URLSearchParams(location.search).get("reference") || "",
    );
  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((d) => setSpeakersBg(d.speakersBackgroundUrl || ""))
      .catch(() => {});
    fetch("/api/speakers")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.speakers))
          setSpeakers(
            d.configured
              ? d.speakers
              : d.speakers.length
                ? d.speakers
                : seedSpeakers,
          );
      })
      .catch(() => {});
  }, []);
  return (
    <Public
      products={products}
      speakersBg={speakersBg}
      speakers={speakers}
      paymentReference={paymentReference}
    />
  );
}
