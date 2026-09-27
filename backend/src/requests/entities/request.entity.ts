import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RequestStatusHistoryEntity } from './request-status-history.entity';
import { RequestStatus } from '../enums/request-status.enum';

@Entity({ name: 'requests' })
export class RequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  departmentId: string;

  @Column()
  requesterId: string;

  @Column('text')
  description: string;

  @Column({ type: 'varchar' })
  status: RequestStatus;

  @Column({ nullable: true })
  ownerId?: string | null;

  @Column({ name: 'expected_resolution_date', type: 'varchar', length: 32, nullable: true })
  expectedResolutionDate: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => RequestStatusHistoryEntity, (history) => history.request)
  statusHistory?: RequestStatusHistoryEntity[];
}
