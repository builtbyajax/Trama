import { t } from "../lib/i18n";

const mark = new URL("../assets/brand/trama-aberta-master.svg", import.meta.url)
  .href;

export function BrandMark({ size = 28 }: { size?: number }) {
  return <img src={mark} width={size} height={size} alt={t("Trama")} />;
}
