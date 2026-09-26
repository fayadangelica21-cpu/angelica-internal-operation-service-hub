import { CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, Column } from 'typeorm';
import { UserRole } from '../requests/current-user';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar' })
  role: UserRole;

  @Column({ type: 'varchar', nullable: true })
  departmentId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
