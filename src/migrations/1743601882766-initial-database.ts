/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */

/**
 * @module
 * @hidden
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSQLMigration1743601882766 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    const queries = InitialSQLMigration1743601882766.sql.split(';').filter((query: string) => query.trim() !== '');

    for (const query of queries) {
      await queryRunner.query(query);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_: QueryRunner): Promise<void> {
    // no-op
  }

  static readonly sql = `
  SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

CREATE TABLE \`assigned_role\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`roleId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`balance\`
--

CREATE TABLE \`balance\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`amount\` int(11) NOT NULL,
  \`lastTransactionId\` int(11) DEFAULT NULL,
  \`lastTransferId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`banner\`
--

CREATE TABLE \`banner\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`duration\` int(11) NOT NULL,
  \`active\` tinyint(4) NOT NULL DEFAULT 0,
  \`startDate\` datetime NOT NULL DEFAULT current_timestamp(),
  \`endDate\` datetime NOT NULL,
  \`imageId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`banner_image\`
--

CREATE TABLE \`banner_image\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`downloadName\` varchar(255) NOT NULL,
  \`location\` varchar(255) NOT NULL,
  \`createdById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`base_file\`
--

CREATE TABLE \`base_file\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`downloadName\` varchar(255) NOT NULL,
  \`location\` varchar(255) NOT NULL,
  \`createdById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`container\`
--

CREATE TABLE \`container\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`currentRevision\` int(11) DEFAULT NULL,
  \`public\` tinyint(4) NOT NULL DEFAULT 0,
  \`ownerId\` int(11) NOT NULL,
  \`deletedAt\` datetime(6) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`container_revision\`
--

CREATE TABLE \`container_revision\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`name\` varchar(64) NOT NULL,
  \`containerId\` int(11) NOT NULL,
  \`revision\` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`container_revision_products_product_revision\`
--

CREATE TABLE \`container_revision_products_product_revision\` (
  \`containerRevisionContainerId\` int(11) NOT NULL,
  \`containerRevisionRevision\` int(11) NOT NULL,
  \`productRevisionProductId\` int(11) NOT NULL,
  \`productRevisionRevision\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`ean_authenticator\`
--

CREATE TABLE \`ean_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`eanCode\` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`event\`
--

CREATE TABLE \`event\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`startDate\` datetime NOT NULL,
  \`endDate\` datetime NOT NULL,
  \`type\` varchar(255) NOT NULL,
  \`createdById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`event_shift\`
--

CREATE TABLE \`event_shift\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`deletedAt\` datetime(6) DEFAULT NULL,
  \`name\` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`event_shifts_event_shift\`
--

CREATE TABLE \`event_shifts_event_shift\` (
  \`eventId\` int(11) NOT NULL,
  \`eventShiftId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`event_shift_answer\`
--

CREATE TABLE \`event_shift_answer\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`availability\` varchar(255) DEFAULT NULL,
  \`selected\` tinyint(4) NOT NULL DEFAULT 0,
  \`shiftId\` int(11) NOT NULL,
  \`eventId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`event_shift_roles_role\`
--

CREATE TABLE \`event_shift_roles_role\` (
  \`eventShiftId\` int(11) NOT NULL,
  \`roleId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`fine\`
--

CREATE TABLE \`fine\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`amount\` int(11) NOT NULL,
  \`fineHandoutEventId\` int(11) NOT NULL,
  \`userFineGroupId\` int(11) NOT NULL,
  \`transferId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`fine_handout_event\`
--

CREATE TABLE \`fine_handout_event\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`referenceDate\` datetime NOT NULL,
  \`createdById\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`gewis_user\`
--

CREATE TABLE \`gewis_user\` (
  \`userId\` int(11) NOT NULL,
  \`gewisId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`invoice\`
--

CREATE TABLE \`invoice\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`toId\` int(11) NOT NULL,
  \`addressee\` varchar(255) NOT NULL,
  \`description\` varchar(255) NULL,
  \`transferId\` int(11) NOT NULL,
  \`reference\` varchar(255) NOT NULL,
  \`street\` varchar(255) NOT NULL,
  \`postalCode\` varchar(255) NOT NULL,
  \`city\` varchar(255) NOT NULL,
  \`country\` varchar(255) NOT NULL,
  \`pdfId\` int(11) DEFAULT NULL,
  \`attention\` varchar(255) NULL DEFAULT '',
  \`date\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`creditTransferId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`invoice_pdf\`
--

CREATE TABLE \`invoice_pdf\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`downloadName\` varchar(255) NOT NULL,
  \`location\` varchar(255) NOT NULL,
  \`hash\` varchar(255) NOT NULL,
  \`createdById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`invoice_status\`
--

CREATE TABLE \`invoice_status\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`state\` int(11) NOT NULL,
  \`invoiceId\` int(11) NOT NULL,
  \`changedById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`invoice_user\`
--

CREATE TABLE \`invoice_user\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`automatic\` tinyint(4) NOT NULL DEFAULT 0,
  \`street\` varchar(255) NOT NULL,
  \`postalCode\` varchar(255) NOT NULL,
  \`city\` varchar(255) NOT NULL,
  \`country\` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`inv_sub_tra_row_del_inv_sub_tra_row\`
--

CREATE TABLE \`inv_sub_tra_row_del_inv_sub_tra_row\` (
  \`invoiceId\` int(11) NOT NULL,
  \`subTransactionRowId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`key_authenticator\`
--

CREATE TABLE \`key_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`hash\` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`ldap_authenticator\`
--

CREATE TABLE \`ldap_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`UUID\` varchar(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`local_authenticator\`
--

CREATE TABLE \`local_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`hash\` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`local_user\`
--

CREATE TABLE \`local_user\` (
  \`userId\` int(11) NOT NULL,
  \`passwordHash\` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`member_authenticator\`
--

CREATE TABLE \`member_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`authenticateAsId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`nfc_authenticator\`
--

CREATE TABLE \`nfc_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`nfcCode\` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`payout_request\`
--

CREATE TABLE \`payout_request\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`amount\` int(11) NOT NULL,
  \`bankAccountNumber\` varchar(255) NOT NULL,
  \`bankAccountName\` varchar(255) NOT NULL,
  \`requestedById\` int(11) NOT NULL,
  \`transferId\` int(11) DEFAULT NULL,
  \`approvedById\` int(11) DEFAULT NULL,
  \`pdfId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`payout_request_pdf\`
--

CREATE TABLE \`payout_request_pdf\` (
  \`id\` int(11) NOT NULL,
  \`hash\` varchar(255) NOT NULL,
  \`downloadName\` varchar(255) NOT NULL,
  \`location\` varchar(255) NOT NULL,
  \`createdById\` int(11) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`payout_request_status\`
--

CREATE TABLE \`payout_request_status\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`state\` varchar(255) NOT NULL,
  \`payoutRequestId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`permission\`
--

CREATE TABLE \`permission\` (
  \`roleId\` int(11) NOT NULL,
  \`action\` varchar(255) NOT NULL,
  \`relation\` varchar(255) NOT NULL,
  \`entity\` varchar(255) NOT NULL,
  \`attributes\` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`pin_authenticator\`
--

CREATE TABLE \`pin_authenticator\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`hash\` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`point_of_sale\`
--

CREATE TABLE \`point_of_sale\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`currentRevision\` int(11) DEFAULT NULL,
  \`ownerId\` int(11) NOT NULL,
  \`deletedAt\` datetime(6) DEFAULT NULL,
  \`userId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`point_of_sale_cashier_roles_role\`
--

CREATE TABLE \`point_of_sale_cashier_roles_role\` (
  \`pointOfSaleId\` int(11) NOT NULL,
  \`roleId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`point_of_sale_revision\`
--

CREATE TABLE \`point_of_sale_revision\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`name\` varchar(64) NOT NULL,
  \`useAuthentication\` tinyint(4) NOT NULL DEFAULT 0,
  \`pointOfSaleId\` int(11) NOT NULL,
  \`revision\` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`point_of_sale_revision_containers_container_revision\`
--

CREATE TABLE \`point_of_sale_revision_containers_container_revision\` (
  \`pointOfSaleRevisionPointOfSaleId\` int(11) NOT NULL,
  \`pointOfSaleRevisionRevision\` int(11) NOT NULL,
  \`containerRevisionContainerId\` int(11) NOT NULL,
  \`containerRevisionRevision\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`product\`
--

CREATE TABLE \`product\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`currentRevision\` int(11) DEFAULT NULL,
  \`ownerId\` int(11) NOT NULL,
  \`imageId\` int(11) DEFAULT NULL,
  \`deletedAt\` datetime(6) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`product_category\`
--

CREATE TABLE \`product_category\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`name\` varchar(64) NOT NULL,
  \`parentId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`product_category_closure\`
--

CREATE TABLE \`product_category_closure\` (
  \`id_ancestor\` int(11) NOT NULL,
  \`id_descendant\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`product_image\`
--

CREATE TABLE \`product_image\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`downloadName\` varchar(255) NOT NULL,
  \`location\` varchar(255) NOT NULL,
  \`createdById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`product_ordering\`
--

CREATE TABLE \`product_ordering\` (
  \`posId\` int(11) NOT NULL,
  \`productId\` int(11) NOT NULL,
  \`order\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`product_revision\`
--

CREATE TABLE \`product_revision\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`name\` varchar(64) NOT NULL,
  \`priceInclVat\` int(11) NOT NULL,
  \`alcoholPercentage\` decimal(10,2) NOT NULL,
  \`productId\` int(11) NOT NULL,
  \`revision\` int(11) NOT NULL DEFAULT 1,
  \`vatId\` int(11) NOT NULL,
  \`categoryId\` int(11) NOT NULL,
  \`featured\` tinyint(4) NOT NULL DEFAULT 0,
  \`preferred\` tinyint(4) NOT NULL DEFAULT 0,
  \`priceList\` tinyint(4) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`reset_token\`
--

CREATE TABLE \`reset_token\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`hash\` varchar(128) NOT NULL,
  \`expires\` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`role\`
--

CREATE TABLE \`role\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`systemDefault\` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`role_user_type\`
--

CREATE TABLE \`role_user_type\` (
  \`roleId\` int(11) NOT NULL,
  \`userType\` varchar(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`seller_payout\`
--

CREATE TABLE \`seller_payout\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`requestedById\` int(11) NOT NULL,
  \`transferId\` int(11) DEFAULT NULL,
  \`amount\` int(11) NOT NULL,
  \`startDate\` datetime(6) NOT NULL,
  \`endDate\` datetime(6) NOT NULL,
  \`reference\` varchar(255) NOT NULL,
  \`pdfId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`seller_payout_pdf\`
--

CREATE TABLE \`seller_payout_pdf\` (
  \`id\` int(11) NOT NULL,
  \`hash\` varchar(255) NOT NULL,
  \`downloadName\` varchar(255) NOT NULL,
  \`location\` varchar(255) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`createdById\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`server_setting\`
--

CREATE TABLE \`server_setting\` (
  \`id\` int(11) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`key\` varchar(255) NOT NULL,
  \`value\` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`stripe_deposit\`
--

CREATE TABLE \`stripe_deposit\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`toId\` int(11) NOT NULL,
  \`transferId\` int(11) DEFAULT NULL,
  \`stripePaymentIntentId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`stripe_payment_intent\`
--

CREATE TABLE \`stripe_payment_intent\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`stripeId\` varchar(255) NOT NULL,
  \`amount\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`stripe_payment_intent_status\`
--

CREATE TABLE \`stripe_payment_intent_status\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`state\` int(11) NOT NULL,
  \`stripePaymentIntentId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`sub_transaction\`
--

CREATE TABLE \`sub_transaction\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`toId\` int(11) NOT NULL,
  \`containerContainerId\` int(11) NOT NULL,
  \`containerRevision\` int(11) NOT NULL,
  \`transactionId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`sub_transaction_row\`
--

CREATE TABLE \`sub_transaction_row\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`amount\` int(11) NOT NULL,
  \`productProductId\` int(11) NOT NULL,
  \`productRevision\` int(11) NOT NULL,
  \`invoiceId\` int(11) DEFAULT NULL,
  \`subTransactionId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`transaction\`
--

CREATE TABLE \`transaction\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`fromId\` int(11) NOT NULL,
  \`createdById\` int(11) NOT NULL,
  \`pointOfSalePointOfSaleId\` int(11) DEFAULT NULL,
  \`pointOfSaleRevision\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`transfer\`
--

CREATE TABLE \`transfer\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`fromId\` int(11) DEFAULT NULL,
  \`toId\` int(11) DEFAULT NULL,
  \`amountInclVat\` int(11) NOT NULL,
  \`description\` varchar(255) DEFAULT NULL,
  \`vatId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`user\`
--

CREATE TABLE \`user\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`firstName\` varchar(64) NOT NULL,
  \`lastName\` varchar(64) NOT NULL DEFAULT '',
  \`active\` tinyint(4) NOT NULL DEFAULT 0,
  \`ofAge\` tinyint(4) NOT NULL DEFAULT 0,
  \`email\` varchar(64) NOT NULL DEFAULT '',
  \`deleted\` tinyint(4) NOT NULL DEFAULT 0,
  \`type\` varchar(64) NOT NULL,
  \`acceptedToS\` varchar(255) NOT NULL DEFAULT 'NOT_ACCEPTED',
  \`extensiveDataProcessing\` tinyint(4) NOT NULL DEFAULT 0,
  \`nickname\` varchar(64) DEFAULT NULL,
  \`currentFinesId\` int(11) DEFAULT NULL,
  \`canGoIntoDebt\` tinyint(4) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`user_fine_group\`
--

CREATE TABLE \`user_fine_group\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`userId\` int(11) NOT NULL,
  \`waivedTransferId\` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`user_voucher_group\`
--

CREATE TABLE \`user_voucher_group\` (
  \`userId\` int(11) NOT NULL,
  \`voucherGroupId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`vat_group\`
--

CREATE TABLE \`vat_group\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`percentage\` double NOT NULL,
  \`deleted\` tinyint(4) NOT NULL DEFAULT 0,
  \`hidden\` tinyint(4) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`voucher_group\`
--

CREATE TABLE \`voucher_group\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`name\` varchar(64) NOT NULL,
  \`activeStartDate\` datetime NOT NULL DEFAULT current_timestamp(),
  \`activeEndDate\` datetime NOT NULL,
  \`amount\` int(11) NOT NULL,
  \`balance\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table \`write_off\`
--

CREATE TABLE \`write_off\` (
  \`createdAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  \`version\` int(11) NOT NULL,
  \`id\` int(11) NOT NULL,
  \`transferId\` int(11) DEFAULT NULL,
  \`amount\` int(11) NOT NULL,
  \`toId\` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf32 COLLATE=utf32_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table \`assigned_role\`
--
ALTER TABLE \`assigned_role\`
  ADD PRIMARY KEY (\`userId\`,\`roleId\`),
  ADD KEY \`IDX_f51f7a75fd982f5f757dc76a24\` (\`createdAt\`);

--
-- Indexes for table \`balance\`
--
ALTER TABLE \`balance\`
  ADD PRIMARY KEY (\`userId\`),
  ADD KEY \`FK_7ea7cc133e5c70f1f80ebeaf194\` (\`lastTransactionId\`),
  ADD KEY \`FK_a52ad6295abc075ef0b25ff2711\` (\`lastTransferId\`),
  ADD KEY \`IDX_0e771013275fb121dce75e6022\` (\`createdAt\`);

--
-- Indexes for table \`banner\`
--
ALTER TABLE \`banner\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`REL_6a6cc2453a0675d3e2cad3070c\` (\`imageId\`),
  ADD KEY \`IDX_98c7dae97e53e193244b6e695a\` (\`createdAt\`);

--
-- Indexes for table \`banner_image\`
--
ALTER TABLE \`banner_image\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_2f6cb6fb09229237f0542a00b50\` (\`createdById\`),
  ADD KEY \`IDX_3fa8a4d985319d91f18bc11ed3\` (\`createdAt\`);

--
-- Indexes for table \`base_file\`
--
ALTER TABLE \`base_file\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_e3163d85b9568a2e2356dbf3780\` (\`createdById\`),
  ADD KEY \`IDX_91f19c398debec3f46e7ef5f4b\` (\`createdAt\`);

--
-- Indexes for table \`container\`
--
ALTER TABLE \`container\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_2e7a0befc04b14d4b22960a7438\` (\`ownerId\`),
  ADD KEY \`IDX_2bde964cf68f4124873433e906\` (\`createdAt\`);

--
-- Indexes for table \`container_revision\`
--
ALTER TABLE \`container_revision\`
  ADD PRIMARY KEY (\`containerId\`,\`revision\`),
  ADD KEY \`IDX_91faf9dd42af7b6891b50b98c6\` (\`createdAt\`);

--
-- Indexes for table \`container_revision_products_product_revision\`
--
ALTER TABLE \`container_revision_products_product_revision\`
  ADD PRIMARY KEY (\`containerRevisionContainerId\`,\`containerRevisionRevision\`,\`productRevisionProductId\`,\`productRevisionRevision\`),
  ADD KEY \`IDX_1ebf86226729e5e2ebcead3005\` (\`containerRevisionContainerId\`,\`containerRevisionRevision\`),
  ADD KEY \`IDX_0aff363152e31f6795fadc45d5\` (\`productRevisionProductId\`,\`productRevisionRevision\`);

--
-- Indexes for table \`ean_authenticator\`
--
ALTER TABLE \`ean_authenticator\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_36cdeedf28dd4a53fdce6b63d4\` (\`userId\`),
  ADD KEY \`IDX_de87f2e595ba08f5800d334f59\` (\`createdAt\`);

--
-- Indexes for table \`event\`
--
ALTER TABLE \`event\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`IDX_77b45e61f3194ba2be468b0778\` (\`createdAt\`);

--
-- Indexes for table \`event_shift\`
--
ALTER TABLE \`event_shift\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`IDX_cdb1fdd9afd869277e2d754818\` (\`createdAt\`);

--
-- Indexes for table \`event_shifts_event_shift\`
--
ALTER TABLE \`event_shifts_event_shift\`
  ADD PRIMARY KEY (\`eventId\`,\`eventShiftId\`),
  ADD KEY \`IDX_4a5816ad85f83216ff9358452e\` (\`eventId\`),
  ADD KEY \`IDX_f37c7de1e636e65e2d45290cf9\` (\`eventShiftId\`);

--
-- Indexes for table \`event_shift_answer\`
--
ALTER TABLE \`event_shift_answer\`
  ADD PRIMARY KEY (\`userId\`, \`shiftId\`, \`eventId\`),
  ADD KEY \`IDX_cde8d23385a9e5db4b82ec3b36\` (\`createdAt\`),
  ADD CONSTRAINT \`FK_a6887f089a4dd5fe71c41526695\` FOREIGN KEY (\`eventId\`) 
    REFERENCES \`event\` (\`id\`) 
    ON DELETE CASCADE;

--
-- Indexes for table \`event_shift_roles_role\`
--
ALTER TABLE \`event_shift_roles_role\`
  ADD PRIMARY KEY (\`eventShiftId\`,\`roleId\`),
  ADD KEY \`FK_ac36ca9f11e4cebf7a7fc4fd1e1\` (\`roleId\`);

--
-- Indexes for table \`fine\`
--
ALTER TABLE \`fine\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`REL_dfd5d8c8fe1b3a4df17be3497d\` (\`transferId\`),
  ADD KEY \`IDX_f218ae3b59a59b93ca62c683db\` (\`createdAt\`);

--
-- Indexes for table \`fine_handout_event\`
--
ALTER TABLE \`fine_handout_event\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`IDX_3a87bd6247b8ef17621a3fdc1b\` (\`createdAt\`);

--
-- Indexes for table \`gewis_user\`
--
ALTER TABLE \`gewis_user\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_6a4af2884aa295cb269d1bcf2b\` (\`userId\`);

--
-- Indexes for table \`invoice\`
--
ALTER TABLE \`invoice\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`REL_f1af5bbf5baeb15ee911f2c54c\` (\`transferId\`),
  ADD UNIQUE KEY \`IDX_fd48ffbca7ab422836aaf73af5\` (\`pdfId\`),
  ADD KEY \`FK_a0c7a052a624e9a630272fe96c6\` (\`toId\`),
  ADD KEY \`IDX_31aef0453df6db5015712eb2d2\` (\`createdAt\`),
  ADD KEY \`FK_ad265ea872d0ffc7d4ea17447ee\` (\`creditTransferId\`);

--
-- Indexes for table \`invoice_pdf\`
--
ALTER TABLE \`invoice_pdf\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_2c0caa648b45955e5b813fcd155\` (\`createdById\`);

--
-- Indexes for table \`invoice_status\`
--
ALTER TABLE \`invoice_status\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_c671f173f08dbe75d91ebd616c7\` (\`invoiceId\`),
  ADD KEY \`FK_a2332a63bc6a70d33b320ddbf2d\` (\`changedById\`),
  ADD KEY \`IDX_773375711d0c5eb97a33b7af75\` (\`createdAt\`);

--
-- Indexes for table \`invoice_user\`
--
ALTER TABLE \`invoice_user\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_273e5b37f9b184fd56e7f2cb08\` (\`userId\`),
  ADD KEY \`IDX_1f527d9878bdf21e83a72dddd2\` (\`createdAt\`);

--
-- Indexes for table \`inv_sub_tra_row_del_inv_sub_tra_row\`
--
ALTER TABLE \`inv_sub_tra_row_del_inv_sub_tra_row\`
  ADD PRIMARY KEY (\`invoiceId\`,\`subTransactionRowId\`),
  ADD KEY \`FK_4de5e0dbf807e44ea9a27b78640\` (\`subTransactionRowId\`);

--
-- Indexes for table \`key_authenticator\`
--
ALTER TABLE \`key_authenticator\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_dd2cfdfc47f968d2b43f679085\` (\`userId\`),
  ADD KEY \`IDX_13b1ced93790bf87059147e25d\` (\`createdAt\`);

--
-- Indexes for table \`ldap_authenticator\`
--
ALTER TABLE \`ldap_authenticator\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_078b5c39c4f95284b2432659cf\` (\`userId\`),
  ADD KEY \`IDX_0f425d81525960879043858973\` (\`createdAt\`);

--
-- Indexes for table \`local_authenticator\`
--
ALTER TABLE \`local_authenticator\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_78485f0182144860f880119e81\` (\`userId\`),
  ADD KEY \`IDX_54496afaf5d75195e91453a312\` (\`createdAt\`);

--
-- Indexes for table \`local_user\`
--
ALTER TABLE \`local_user\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_0a390f6d32bff639d6d6790f79\` (\`userId\`);

--
-- Indexes for table \`member_authenticator\`
--
ALTER TABLE \`member_authenticator\`
  ADD PRIMARY KEY (\`userId\`,\`authenticateAsId\`),
  ADD KEY \`FK_1b2c38d5eed7a76676147f66bc8\` (\`authenticateAsId\`),
  ADD KEY \`IDX_adbeb4fa2591bf41d3acea5452\` (\`createdAt\`);

--
-- Indexes for table \`nfc_authenticator\`
--
ALTER TABLE \`nfc_authenticator\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_dbfd146b964e7ef3a956281162\` (\`userId\`),
  ADD KEY \`IDX_b744672f9037239c8fd00223ec\` (\`createdAt\`);

--
-- Indexes for table \`payout_request\`
--
ALTER TABLE \`payout_request\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`REL_956cef8545f8bc1944809f69c2\` (\`transferId\`),
  ADD KEY \`FK_5ff1718fd7ef4b1314c279124fb\` (\`requestedById\`),
  ADD KEY \`FK_b48700107cc13b06f601a7332ec\` (\`approvedById\`),
  ADD KEY \`IDX_d2436d4c1075edd6ac1df10860\` (\`createdAt\`),
  ADD KEY \`FK_c54ab0d505973c4a37a9d1ddeb0\` (\`pdfId\`);

--
-- Indexes for table \`payout_request_pdf\`
--
ALTER TABLE \`payout_request_pdf\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_ea897a3fed381cb32d4ba81fd5c\` (\`createdById\`);

--
-- Indexes for table \`payout_request_status\`
--
ALTER TABLE \`payout_request_status\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_8f370d8326498ec78ba1679f332\` (\`payoutRequestId\`),
  ADD KEY \`IDX_cc029c5b23ea4b7d34d77e0921\` (\`createdAt\`);

--
-- Indexes for table \`permission\`
--
ALTER TABLE \`permission\`
  ADD PRIMARY KEY (\`roleId\`,\`action\`,\`relation\`,\`entity\`);

--
-- Indexes for table \`pin_authenticator\`
--
ALTER TABLE \`pin_authenticator\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_c1d1f7d7798b4163ccc4834f5f\` (\`userId\`),
  ADD KEY \`IDX_052778557e67f46df4a55e3670\` (\`createdAt\`);

--
-- Indexes for table \`point_of_sale\`
--
ALTER TABLE \`point_of_sale\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`IDX_a0ccf55f761fcc887394bf4309\` (\`userId\`),
  ADD KEY \`FK_24fb8a721a293ac72c10ac5de61\` (\`ownerId\`),
  ADD KEY \`IDX_ec4298708311ae8ca1a574aac4\` (\`createdAt\`);

--
-- Indexes for table \`point_of_sale_cashier_roles_role\`
--
ALTER TABLE \`point_of_sale_cashier_roles_role\`
  ADD PRIMARY KEY (\`pointOfSaleId\`,\`roleId\`),
  ADD KEY \`FK_424767742bed3867b8edfb4c14e\` (\`roleId\`);

--
-- Indexes for table \`point_of_sale_revision\`
--
ALTER TABLE \`point_of_sale_revision\`
  ADD PRIMARY KEY (\`pointOfSaleId\`,\`revision\`),
  ADD KEY \`IDX_271eb7e95de682b69cbe72429f\` (\`createdAt\`);

--
-- Indexes for table \`point_of_sale_revision_containers_container_revision\`
--
ALTER TABLE \`point_of_sale_revision_containers_container_revision\`
  ADD PRIMARY KEY (\`pointOfSaleRevisionPointOfSaleId\`,\`pointOfSaleRevisionRevision\`,\`containerRevisionContainerId\`,\`containerRevisionRevision\`),
  ADD KEY \`IDX_33376b1706747cf7c1aa3f875f\` (\`pointOfSaleRevisionPointOfSaleId\`,\`pointOfSaleRevisionRevision\`),
  ADD KEY \`IDX_beba133c317de33aa612f6737e\` (\`containerRevisionContainerId\`,\`containerRevisionRevision\`);

--
-- Indexes for table \`product\`
--
ALTER TABLE \`product\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`REL_b1b332c0f436897f21a960f26c\` (\`imageId\`),
  ADD KEY \`FK_cbb5d890de1519efa20c42bcd52\` (\`ownerId\`),
  ADD KEY \`IDX_6b71c587b0fd3855fa23b759ca\` (\`createdAt\`);

--
-- Indexes for table \`product_category\`
--
ALTER TABLE \`product_category\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`IDX_96152d453aaea425b5afde3ae9\` (\`name\`),
  ADD KEY \`IDX_f0495180538f78a4b0c975e405\` (\`createdAt\`),
  ADD KEY \`FK_569b30aa4b0a1ad42bcd30916aa\` (\`parentId\`);

--
-- Indexes for table \`product_category_closure\`
--
ALTER TABLE \`product_category_closure\`
  ADD PRIMARY KEY (\`id_ancestor\`,\`id_descendant\`),
  ADD KEY \`FK_cb4a5e74ae032bac3f614096ebd\` (\`id_descendant\`);

--
-- Indexes for table \`product_image\`
--
ALTER TABLE \`product_image\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_b184df3290d5052115eb3e9e3dc\` (\`createdById\`),
  ADD KEY \`IDX_d7de3082fc3416e669e5032738\` (\`createdAt\`);

--
-- Indexes for table \`product_ordering\`
--
ALTER TABLE \`product_ordering\`
  ADD PRIMARY KEY (\`posId\`,\`productId\`),
  ADD UNIQUE KEY \`IDX_f34b7832069ef698d2eb6d7b50\` (\`posId\`,\`productId\`,\`order\`),
  ADD KEY \`FK_9e85b9443e2cdbcbd60fc5c3daf\` (\`productId\`);

--
-- Indexes for table \`product_revision\`
--
ALTER TABLE \`product_revision\`
  ADD PRIMARY KEY (\`productId\`,\`revision\`),
  ADD KEY \`FK_98524ea1462e06ea2e49f98fb41\` (\`vatId\`),
  ADD KEY \`FK_4c2b27e9edcada5b7c32a1bba4f\` (\`categoryId\`),
  ADD KEY \`IDX_83a955d71e12c919cc0cb0d53b\` (\`createdAt\`);

--
-- Indexes for table \`reset_token\`
--
ALTER TABLE \`reset_token\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_1d61419c157e5325204cbee7a2\` (\`userId\`),
  ADD KEY \`IDX_6a6b2774850a62749860e15e5b\` (\`createdAt\`);

--
-- Indexes for table \`role\`
--
ALTER TABLE \`role\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`UQ_ae4578dcaed5adff96595e61660\` (\`name\`);

--
-- Indexes for table \`role_user_type\`
--
ALTER TABLE \`role_user_type\`
  ADD PRIMARY KEY (\`roleId\`,\`userType\`);

--
-- Indexes for table \`seller_payout\`
--
ALTER TABLE \`seller_payout\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_ba291220bb8a8198b41af5b3fc7\` (\`requestedById\`),
  ADD KEY \`FK_878c15e23faca012e8279d296a8\` (\`transferId\`),
  ADD KEY \`FK_57f50cd5e7f8f80414395fdde40\` (\`pdfId\`);

--
-- Indexes for table \`seller_payout_pdf\`
--
ALTER TABLE \`seller_payout_pdf\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_bb5ce24f6db4174ef68b12a94a2\` (\`createdById\`);

--
-- Indexes for table \`server_setting\`
--
ALTER TABLE \`server_setting\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`UQ_47b83d413b2f2d6684c10468650\` (\`key\`);

--
-- Indexes for table \`stripe_deposit\`
--
ALTER TABLE \`stripe_deposit\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_30003949e49a55ddef927ac3ea9\` (\`toId\`),
  ADD KEY \`FK_e3de95c17c9760e68b9d2ac9409\` (\`transferId\`),
  ADD KEY \`FK_996daa2cc2a7322684f827fa030\` (\`stripePaymentIntentId\`);

--
-- Indexes for table \`stripe_payment_intent\`
--
ALTER TABLE \`stripe_payment_intent\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`IDX_3107e59c1952213436dcbb6c5a\` (\`stripeId\`),
  ADD KEY \`IDX_f5e3d623477dca34bba9a77cb8\` (\`createdAt\`);

--
-- Indexes for table \`stripe_payment_intent_status\`
--
ALTER TABLE \`stripe_payment_intent_status\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`IDX_e4b29bd67e51ff6d4a5d82738d\` (\`createdAt\`),
  ADD KEY \`FK_8f454dd76a0725b815a5c046aae\` (\`stripePaymentIntentId\`);

--
-- Indexes for table \`sub_transaction\`
--
ALTER TABLE \`sub_transaction\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_b52f0bfde289a856a1676e4e438\` (\`toId\`),
  ADD KEY \`FK_6a979da149afbd5b55fe95d8441\` (\`containerContainerId\`,\`containerRevision\`),
  ADD KEY \`FK_865e795ceccbf5a980afa6340e5\` (\`transactionId\`),
  ADD KEY \`IDX_4d38ed98b11cab29cbf5704495\` (\`createdAt\`);

--
-- Indexes for table \`sub_transaction_row\`
--
ALTER TABLE \`sub_transaction_row\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_08486ddd45c1b59aac61c902057\` (\`productProductId\`,\`productRevision\`),
  ADD KEY \`FK_f3b08edb69ad5d07a66d8772672\` (\`invoiceId\`),
  ADD KEY \`FK_43ce16296a2fb07d50c417bbf23\` (\`subTransactionId\`),
  ADD KEY \`IDX_0a365df9c0df420ecf9a3be41e\` (\`createdAt\`);

--
-- Indexes for table \`transaction\`
--
ALTER TABLE \`transaction\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_ac3d6711c8adf322a76c0d1a227\` (\`fromId\`),
  ADD KEY \`FK_d2c2c2e40cf2e32e72bb111f6a0\` (\`createdById\`),
  ADD KEY \`FK_928a8e95de543fca4327cd47877\` (\`pointOfSalePointOfSaleId\`,\`pointOfSaleRevision\`),
  ADD KEY \`IDX_83cb622ce2d74c56db3e0c29f1\` (\`createdAt\`);

--
-- Indexes for table \`transfer\`
--
ALTER TABLE \`transfer\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_9bc2f01e5bc90eab1015548b5ab\` (\`fromId\`),
  ADD KEY \`FK_06b33ebdc8919ff5d34646c6fe3\` (\`toId\`),
  ADD KEY \`IDX_ad898da19a2036169276bec8c1\` (\`createdAt\`),
  ADD KEY \`FK_982efd15d8f524a263dc0dacd1c\` (\`vatId\`);

--
-- Indexes for table \`user\`
--
ALTER TABLE \`user\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`IDX_b42ca95830a90a240d46c70572\` (\`currentFinesId\`),
  ADD KEY \`IDX_e11e649824a45d8ed01d597fd9\` (\`createdAt\`);

--
-- Indexes for table \`user_fine_group\`
--
ALTER TABLE \`user_fine_group\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`REL_81d497d07c08c585214949267a\` (\`waivedTransferId\`),
  ADD KEY \`IDX_287aa509b39d191a3447a9fe00\` (\`createdAt\`);

--
-- Indexes for table \`user_voucher_group\`
--
ALTER TABLE \`user_voucher_group\`
  ADD PRIMARY KEY (\`userId\`),
  ADD UNIQUE KEY \`REL_e8a6a3a59081155d48fcb8e854\` (\`userId\`);

--
-- Indexes for table \`vat_group\`
--
ALTER TABLE \`vat_group\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`IDX_9b50121f931a09b932f6d1382f\` (\`createdAt\`);

--
-- Indexes for table \`voucher_group\`
--
ALTER TABLE \`voucher_group\`
  ADD PRIMARY KEY (\`id\`),
  ADD UNIQUE KEY \`IDX_afb774509fb3d1c802647d86f7\` (\`name\`),
  ADD KEY \`IDX_392326af17f0b4115bea11e749\` (\`createdAt\`);

--
-- Indexes for table \`write_off\`
--
ALTER TABLE \`write_off\`
  ADD PRIMARY KEY (\`id\`),
  ADD KEY \`FK_write_off_transferId\` (\`transferId\`),
  ADD KEY \`FK_write_off_toId\` (\`toId\`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table \`banner\`
--
ALTER TABLE \`banner\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`banner_image\`
--
ALTER TABLE \`banner_image\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`base_file\`
--
ALTER TABLE \`base_file\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`container\`
--
ALTER TABLE \`container\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`event\`
--
ALTER TABLE \`event\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`event_shift\`
--
ALTER TABLE \`event_shift\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`fine\`
--
ALTER TABLE \`fine\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`fine_handout_event\`
--
ALTER TABLE \`fine_handout_event\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`invoice\`
--
ALTER TABLE \`invoice\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`invoice_pdf\`
--
ALTER TABLE \`invoice_pdf\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`invoice_status\`
--
ALTER TABLE \`invoice_status\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;


--
-- AUTO_INCREMENT for table \`payout_request\`
--
ALTER TABLE \`payout_request\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`payout_request_pdf\`
--
ALTER TABLE \`payout_request_pdf\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`payout_request_status\`
--
ALTER TABLE \`payout_request_status\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`point_of_sale\`
--
ALTER TABLE \`point_of_sale\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`product\`
--
ALTER TABLE \`product\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`product_category\`
--
ALTER TABLE \`product_category\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`product_image\`
--
ALTER TABLE \`product_image\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`role\`
--
ALTER TABLE \`role\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`seller_payout\`
--
ALTER TABLE \`seller_payout\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`seller_payout_pdf\`
--
ALTER TABLE \`seller_payout_pdf\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`server_setting\`
--
ALTER TABLE \`server_setting\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`stripe_deposit\`
--
ALTER TABLE \`stripe_deposit\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`stripe_payment_intent\`
--
ALTER TABLE \`stripe_payment_intent\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`stripe_payment_intent_status\`
--
ALTER TABLE \`stripe_payment_intent_status\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`sub_transaction\`
--
ALTER TABLE \`sub_transaction\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`sub_transaction_row\`
--
ALTER TABLE \`sub_transaction_row\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`transaction\`
--
ALTER TABLE \`transaction\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`transfer\`
--
ALTER TABLE \`transfer\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`user\`
--
ALTER TABLE \`user\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`user_fine_group\`
--
ALTER TABLE \`user_fine_group\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`vat_group\`
--
ALTER TABLE \`vat_group\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`voucher_group\`
--
ALTER TABLE \`voucher_group\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table \`write_off\`
--
ALTER TABLE \`write_off\`
  MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table \`assigned_role\`
--
ALTER TABLE \`assigned_role\`
  ADD CONSTRAINT \`FK_32eef7ed7f4c9e41ce2df201a8c\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`balance\`
--
ALTER TABLE \`balance\`
  ADD CONSTRAINT \`FK_7ea7cc133e5c70f1f80ebeaf194\` FOREIGN KEY (\`lastTransactionId\`) REFERENCES \`transaction\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_9297a70b26dc787156fa49de26b\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_a52ad6295abc075ef0b25ff2711\` FOREIGN KEY (\`lastTransferId\`) REFERENCES \`transfer\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION;

--
-- Constraints for table \`banner\`
--
ALTER TABLE \`banner\`
  ADD CONSTRAINT \`FK_6a6cc2453a0675d3e2cad3070c0\` FOREIGN KEY (\`imageId\`) REFERENCES \`banner_image\` (\`id\`) ON UPDATE NO ACTION;

--
-- Constraints for table \`banner_image\`
--
ALTER TABLE \`banner_image\`
  ADD CONSTRAINT \`FK_2f6cb6fb09229237f0542a00b50\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`base_file\`
--
ALTER TABLE \`base_file\`
  ADD CONSTRAINT \`FK_e3163d85b9568a2e2356dbf3780\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`container\`
--
ALTER TABLE \`container\`
  ADD CONSTRAINT \`FK_2e7a0befc04b14d4b22960a7438\` FOREIGN KEY (\`ownerId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`container_revision\`
--
ALTER TABLE \`container_revision\`
  ADD CONSTRAINT \`FK_c68449032c093b4b1ac0a715500\` FOREIGN KEY (\`containerId\`) REFERENCES \`container\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`container_revision_products_product_revision\`
--
ALTER TABLE \`container_revision_products_product_revision\`
  ADD CONSTRAINT \`FK_0aff363152e31f6795fadc45d57\` FOREIGN KEY (\`productRevisionProductId\`,\`productRevisionRevision\`) REFERENCES \`product_revision\` (\`productId\`, \`revision\`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT \`FK_1ebf86226729e5e2ebcead30054\` FOREIGN KEY (\`containerRevisionContainerId\`,\`containerRevisionRevision\`) REFERENCES \`container_revision\` (\`containerId\`, \`revision\`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table \`ean_authenticator\`
--
ALTER TABLE \`ean_authenticator\`
  ADD CONSTRAINT \`FK_36cdeedf28dd4a53fdce6b63d45\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`event_shift_roles_role\`
--
ALTER TABLE \`event_shift_roles_role\`
  ADD CONSTRAINT \`FK_ac36ca9f11e4cebf7a7fc4fd1e1\` FOREIGN KEY (\`roleId\`) REFERENCES \`role\` (\`id\`) ON DELETE CASCADE,
  ADD CONSTRAINT \`FK_b7bc5f8d015ac4ab0fa9353cea0\` FOREIGN KEY (\`eventShiftId\`) REFERENCES \`event_shift\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`gewis_user\`
--
ALTER TABLE \`gewis_user\`
  ADD CONSTRAINT \`FK_6a4af2884aa295cb269d1bcf2ba\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`invoice\`
--
ALTER TABLE \`invoice\`
  ADD CONSTRAINT \`FK_a0c7a052a624e9a630272fe96c6\` FOREIGN KEY (\`toId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_ad265ea872d0ffc7d4ea17447ee\` FOREIGN KEY (\`creditTransferId\`) REFERENCES \`transfer\` (\`id\`),
  ADD CONSTRAINT \`FK_f1af5bbf5baeb15ee911f2c54ca\` FOREIGN KEY (\`transferId\`) REFERENCES \`transfer\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_fd48ffbca7ab422836aaf73af5c\` FOREIGN KEY (\`pdfId\`) REFERENCES \`invoice_pdf\` (\`id\`);

--
-- Constraints for table \`invoice_pdf\`
--
ALTER TABLE \`invoice_pdf\`
  ADD CONSTRAINT \`FK_2c0caa648b45955e5b813fcd155\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`invoice_status\`
--
ALTER TABLE \`invoice_status\`
  ADD CONSTRAINT \`FK_a2332a63bc6a70d33b320ddbf2d\` FOREIGN KEY (\`changedById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_c671f173f08dbe75d91ebd616c7\` FOREIGN KEY (\`invoiceId\`) REFERENCES \`invoice\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`invoice_user\`
--
ALTER TABLE \`invoice_user\`
  ADD CONSTRAINT \`FK_273e5b37f9b184fd56e7f2cb08a\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`inv_sub_tra_row_del_inv_sub_tra_row\`
--
ALTER TABLE \`inv_sub_tra_row_del_inv_sub_tra_row\`
  ADD CONSTRAINT \`FK_4de5e0dbf807e44ea9a27b78640\` FOREIGN KEY (\`subTransactionRowId\`) REFERENCES \`sub_transaction_row\` (\`id\`) ON DELETE CASCADE,
  ADD CONSTRAINT \`FK_d9eda7c96531aa0fa3d8a6faf4e\` FOREIGN KEY (\`invoiceId\`) REFERENCES \`invoice\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`ldap_authenticator\`
--
ALTER TABLE \`ldap_authenticator\`
  ADD CONSTRAINT \`FK_078b5c39c4f95284b2432659cfd\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`local_authenticator\`
--
ALTER TABLE \`local_authenticator\`
  ADD CONSTRAINT \`FK_78485f0182144860f880119e819\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`local_user\`
--
ALTER TABLE \`local_user\`
  ADD CONSTRAINT \`FK_0a390f6d32bff639d6d6790f79c\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`member_authenticator\`
--
ALTER TABLE \`member_authenticator\`
  ADD CONSTRAINT \`FK_1b2c38d5eed7a76676147f66bc8\` FOREIGN KEY (\`authenticateAsId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`nfc_authenticator\`
--
ALTER TABLE \`nfc_authenticator\`
  ADD CONSTRAINT \`FK_dbfd146b964e7ef3a956281162e\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`payout_request\`
--
ALTER TABLE \`payout_request\`
  ADD CONSTRAINT \`FK_5ff1718fd7ef4b1314c279124fb\` FOREIGN KEY (\`requestedById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_956cef8545f8bc1944809f69c24\` FOREIGN KEY (\`transferId\`) REFERENCES \`transfer\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_b48700107cc13b06f601a7332ec\` FOREIGN KEY (\`approvedById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_c54ab0d505973c4a37a9d1ddeb0\` FOREIGN KEY (\`pdfId\`) REFERENCES \`payout_request_pdf\` (\`id\`);

--
-- Constraints for table \`payout_request_pdf\`
--
ALTER TABLE \`payout_request_pdf\`
  ADD CONSTRAINT \`FK_ea897a3fed381cb32d4ba81fd5c\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`payout_request_status\`
--
ALTER TABLE \`payout_request_status\`
  ADD CONSTRAINT \`FK_8f370d8326498ec78ba1679f332\` FOREIGN KEY (\`payoutRequestId\`) REFERENCES \`payout_request\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`permission\`
--
ALTER TABLE \`permission\`
  ADD CONSTRAINT \`FK_cdb4db95384a1cf7a837c4c683e\` FOREIGN KEY (\`roleId\`) REFERENCES \`role\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`pin_authenticator\`
--
ALTER TABLE \`pin_authenticator\`
  ADD CONSTRAINT \`FK_c1d1f7d7798b4163ccc4834f5fe\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`point_of_sale\`
--
ALTER TABLE \`point_of_sale\`
  ADD CONSTRAINT \`FK_24fb8a721a293ac72c10ac5de61\` FOREIGN KEY (\`ownerId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_a0ccf55f761fcc887394bf4309b\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`);

--
-- Constraints for table \`point_of_sale_cashier_roles_role\`
--
ALTER TABLE \`point_of_sale_cashier_roles_role\`
  ADD CONSTRAINT \`FK_424767742bed3867b8edfb4c14e\` FOREIGN KEY (\`roleId\`) REFERENCES \`role\` (\`id\`) ON DELETE CASCADE,
  ADD CONSTRAINT \`FK_d9c043a3957a31d7f699b0932f0\` FOREIGN KEY (\`pointOfSaleId\`) REFERENCES \`point_of_sale\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`point_of_sale_revision\`
--
ALTER TABLE \`point_of_sale_revision\`
  ADD CONSTRAINT \`FK_cf563b738966171e8680239ffe3\` FOREIGN KEY (\`pointOfSaleId\`) REFERENCES \`point_of_sale\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`point_of_sale_revision_containers_container_revision\`
--
ALTER TABLE \`point_of_sale_revision_containers_container_revision\`
  ADD CONSTRAINT \`FK_33376b1706747cf7c1aa3f875f2\` FOREIGN KEY (\`pointOfSaleRevisionPointOfSaleId\`,\`pointOfSaleRevisionRevision\`) REFERENCES \`point_of_sale_revision\` (\`pointOfSaleId\`, \`revision\`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT \`FK_beba133c317de33aa612f6737e6\` FOREIGN KEY (\`containerRevisionContainerId\`,\`containerRevisionRevision\`) REFERENCES \`container_revision\` (\`containerId\`, \`revision\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`product\`
--
ALTER TABLE \`product\`
  ADD CONSTRAINT \`FK_b1b332c0f436897f21a960f26c7\` FOREIGN KEY (\`imageId\`) REFERENCES \`product_image\` (\`id\`) ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_cbb5d890de1519efa20c42bcd52\` FOREIGN KEY (\`ownerId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`product_category\`
--
ALTER TABLE \`product_category\`
  ADD CONSTRAINT \`FK_569b30aa4b0a1ad42bcd30916aa\` FOREIGN KEY (\`parentId\`) REFERENCES \`product_category\` (\`id\`);

--
-- Constraints for table \`product_category_closure\`
--
ALTER TABLE \`product_category_closure\`
  ADD CONSTRAINT \`FK_cb4a5e74ae032bac3f614096ebd\` FOREIGN KEY (\`id_descendant\`) REFERENCES \`product_category\` (\`id\`) ON DELETE CASCADE,
  ADD CONSTRAINT \`FK_da967ccb3697d66f43122eec2f0\` FOREIGN KEY (\`id_ancestor\`) REFERENCES \`product_category\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`product_image\`
--
ALTER TABLE \`product_image\`
  ADD CONSTRAINT \`FK_b184df3290d5052115eb3e9e3dc\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`product_ordering\`
--
ALTER TABLE \`product_ordering\`
  ADD CONSTRAINT \`FK_9e85b9443e2cdbcbd60fc5c3daf\` FOREIGN KEY (\`productId\`) REFERENCES \`product\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_c301bcdbc96620a03407969c377\` FOREIGN KEY (\`posId\`) REFERENCES \`point_of_sale\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`product_revision\`
--
ALTER TABLE \`product_revision\`
  ADD CONSTRAINT \`FK_4c2b27e9edcada5b7c32a1bba4f\` FOREIGN KEY (\`categoryId\`) REFERENCES \`product_category\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_98524ea1462e06ea2e49f98fb41\` FOREIGN KEY (\`vatId\`) REFERENCES \`vat_group\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_d0bf413994264a323d914f1c767\` FOREIGN KEY (\`productId\`) REFERENCES \`product\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`reset_token\`
--
ALTER TABLE \`reset_token\`
  ADD CONSTRAINT \`FK_1d61419c157e5325204cbee7a28\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`role_user_type\`
--
ALTER TABLE \`role_user_type\`
  ADD CONSTRAINT \`FK_618acabb65230c8f4f1dc431523\` FOREIGN KEY (\`roleId\`) REFERENCES \`role\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`seller_payout\`
--
ALTER TABLE \`seller_payout\`
  ADD CONSTRAINT \`FK_57f50cd5e7f8f80414395fdde40\` FOREIGN KEY (\`pdfId\`) REFERENCES \`seller_payout_pdf\` (\`id\`),
  ADD CONSTRAINT \`FK_878c15e23faca012e8279d296a8\` FOREIGN KEY (\`transferId\`) REFERENCES \`transfer\` (\`id\`),
  ADD CONSTRAINT \`FK_ba291220bb8a8198b41af5b3fc7\` FOREIGN KEY (\`requestedById\`) REFERENCES \`user\` (\`id\`);

--
-- Constraints for table \`seller_payout_pdf\`
--
ALTER TABLE \`seller_payout_pdf\`
  ADD CONSTRAINT \`FK_bb5ce24f6db4174ef68b12a94a2\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`stripe_deposit\`
--
ALTER TABLE \`stripe_deposit\`
  ADD CONSTRAINT \`FK_30003949e49a55ddef927ac3ea9\` FOREIGN KEY (\`toId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
  ADD CONSTRAINT \`FK_996daa2cc2a7322684f827fa030\` FOREIGN KEY (\`stripePaymentIntentId\`) REFERENCES \`stripe_payment_intent\` (\`id\`),
  ADD CONSTRAINT \`FK_e3de95c17c9760e68b9d2ac9409\` FOREIGN KEY (\`transferId\`) REFERENCES \`transfer\` (\`id\`) ON DELETE CASCADE;

--
-- Constraints for table \`stripe_payment_intent_status\`
--
ALTER TABLE \`stripe_payment_intent_status\`
  ADD CONSTRAINT \`FK_8f454dd76a0725b815a5c046aae\` FOREIGN KEY (\`stripePaymentIntentId\`) REFERENCES \`stripe_payment_intent\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`sub_transaction\`
--
ALTER TABLE \`sub_transaction\`
  ADD CONSTRAINT \`FK_6a979da149afbd5b55fe95d8441\` FOREIGN KEY (\`containerContainerId\`,\`containerRevision\`) REFERENCES \`container_revision\` (\`containerId\`, \`revision\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_865e795ceccbf5a980afa6340e5\` FOREIGN KEY (\`transactionId\`) REFERENCES \`transaction\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT \`FK_b52f0bfde289a856a1676e4e438\` FOREIGN KEY (\`toId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`sub_transaction_row\`
--
ALTER TABLE \`sub_transaction_row\`
  ADD CONSTRAINT \`FK_08486ddd45c1b59aac61c902057\` FOREIGN KEY (\`productProductId\`,\`productRevision\`) REFERENCES \`product_revision\` (\`productId\`, \`revision\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_43ce16296a2fb07d50c417bbf23\` FOREIGN KEY (\`subTransactionId\`) REFERENCES \`sub_transaction\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_f3b08edb69ad5d07a66d8772672\` FOREIGN KEY (\`invoiceId\`) REFERENCES \`invoice\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`transaction\`
--
ALTER TABLE \`transaction\`
  ADD CONSTRAINT \`FK_928a8e95de543fca4327cd47877\` FOREIGN KEY (\`pointOfSalePointOfSaleId\`,\`pointOfSaleRevision\`) REFERENCES \`point_of_sale_revision\` (\`pointOfSaleId\`, \`revision\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_ac3d6711c8adf322a76c0d1a227\` FOREIGN KEY (\`fromId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_d2c2c2e40cf2e32e72bb111f6a0\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`transfer\`
--
ALTER TABLE \`transfer\`
  ADD CONSTRAINT \`FK_06b33ebdc8919ff5d34646c6fe3\` FOREIGN KEY (\`toId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT \`FK_982efd15d8f524a263dc0dacd1c\` FOREIGN KEY (\`vatId\`) REFERENCES \`vat_group\` (\`id\`) ON DELETE SET NULL,
  ADD CONSTRAINT \`FK_9bc2f01e5bc90eab1015548b5ab\` FOREIGN KEY (\`fromId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION;

--
-- Constraints for table \`write_off\`
--
ALTER TABLE \`write_off\`
  ADD CONSTRAINT \`FK_write_off_toId\` FOREIGN KEY (\`toId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
  ADD CONSTRAINT \`FK_write_off_transferId\` FOREIGN KEY (\`transferId\`) REFERENCES \`transfer\` (\`id\`) ON DELETE CASCADE;
COMMIT;`;
}
