import BaseEntityWithoutId from "../base-entity-without-id";
import {Column, JoinColumn, ManyToMany, ManyToOne} from "typeorm";
import User from "../user";
import Container from "../container/container";

export default class BasePointOfSale extends BaseEntityWithoutId {
  @Column({
    unique: true,
    length: 64,
  })
  public name: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner' })
  public owner: User;

  public startDate: Date;

  public endDate: Date;

  public approved: boolean = false;

  public useAuthentication: boolean;

  @ManyToMany(() => Container)
  @JoinColumn({ name: 'containers' })
  public containers: Container[];
}
