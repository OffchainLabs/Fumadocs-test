import React from 'react';
import styles from './styles.module.css';

interface Props {
  children: React.ReactNode;
  summary?: string | React.ReactElement;
  className?: string;
}

export default function CustomDetails({ children, summary, className }: Props) {
  return (
    <details className={`${styles.details} ${className ?? ''}`}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
