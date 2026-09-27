import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Column } from 'typeorm';
import { RequestEntity } from './request.entity';
import { RequestStatus } from '../enums/request-status.enum';

@Entity({ name: 'request_status_history' })
export class RequestStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  historyId: string;

  @Column()
  requestId: string;

  @ManyToOne(() => RequestEntity, (request) => request.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request: RequestEntity;

  @Column({ type: 'varchar', nullable: true })
  fromStatus: RequestStatus | null;

  @Column({ type: 'varchar' })
  toStatus: RequestStatus;

  @Column()
  changedByUserId: string;

  @CreateDateColumn()
  changedAt: Date;
}
