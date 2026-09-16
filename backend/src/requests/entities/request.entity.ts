import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
