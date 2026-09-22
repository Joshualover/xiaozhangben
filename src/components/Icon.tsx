import { getIcon } from '@/lib/icons';

interface Props {
  name: string | undefined;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, strokeWidth = 1.8 }: Props) {
  const Cmp = getIcon(name);
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

interface TileProps {
  name: string | undefined;
  color: string;
  size?: number;
  small?: boolean;
}

/** 分类 / 账户的彩色圆形图标底 */
export function IconTile({ name, color, size = 34, small = false }: TileProps) {
  return (
    <span
      className={small ? 'cat-icon is-sm' : 'cat-icon'}
      style={{ background: color, width: size, height: size }}
    >
      <Icon name={name} size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
