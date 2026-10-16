import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Model Delegator · 模型调度',description:'私人多模型调度，按需咨询与独立复核。'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
